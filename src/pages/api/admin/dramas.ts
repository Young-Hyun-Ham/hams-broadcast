import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../../../lib/firebaseAdmin";
import { getWeekFormattedString } from "../../../services/dramaCollector";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";

export const prerender = false;

type DramaInput = {
  countryCode?: string;
  docId?: string;
  id?: string;
  broadcaster?: string;
  title?: string;
  slot?: string;
  airDays?: string[];
  airTime?: string;
  thumbnailUrl?: string;
  directors?: string[];
  cast?: Array<{ name?: string; roleName?: string; isLead?: boolean }>;
  characters?: Array<{ name?: string; actor?: string; description?: string }>;
};

function countryCode(value = "KR") {
  const country = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("올바른 국가 코드가 아닙니다.");
  return country;
}

function target(countryValue = "KR", documentId?: string) {
  const country = countryCode(countryValue);
  const currentWeek = getWeekFormattedString();
  const docId = documentId || `${country}_${currentWeek}`;
  if (!docId.startsWith(`${country}_`) || docId.includes("/")) throw new Error("올바른 편성표 ID가 아닙니다.");
  const week = docId.slice(country.length + 1);
  return { country, week, ref: db.collection("broadcast").doc(docId) };
}

function clean(body: DramaInput) {
  const title = String(body.title || "").trim();
  const broadcaster = String(body.broadcaster || "").trim();
  if (!title || !broadcaster) throw new Error("방송사와 드라마 제목은 필수입니다.");
  const thumbnailUrl = String(body.thumbnailUrl || "").trim();
  if (thumbnailUrl) {
    const url = new URL(thumbnailUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error("썸네일은 http 또는 https URL이어야 합니다.");
  }
  return {
    broadcaster,
    title,
    slot: String(body.slot || "").trim(),
    airDays: Array.isArray(body.airDays) ? body.airDays.map(String).filter(Boolean) : [],
    airTime: String(body.airTime || "").trim(),
    thumbnailUrl,
    directors: Array.isArray(body.directors)
      ? body.directors.map((value) => String(value).trim()).filter(Boolean)
      : [],
    cast: Array.isArray(body.cast)
      ? body.cast.map((item) => ({
          name: String(item?.name || "").trim(),
          roleName: String(item?.roleName || "").trim(),
          isLead: Boolean(item?.isLead),
        })).filter((item) => item.name)
      : [],
    characters: Array.isArray(body.characters)
      ? body.characters.map((item) => ({
          name: String(item?.name || "").trim(),
          actor: String(item?.actor || "").trim(),
          description: String(item?.description || "").trim(),
        })).filter((item) => item.name || item.actor)
      : [],
    updatedAt: Timestamp.now(),
  };
}

export const GET: APIRoute = async ({ url, request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const requestedCountry = countryCode(url.searchParams.get("country") || "KR");
    const requestedDocId = url.searchParams.get("docId") || "";
    if (!requestedDocId) {
      const snapshot = await db.collection("broadcast").where("countryCode", "==", requestedCountry).get();
      const schedules = await Promise.all(snapshot.docs.map(async (document) => {
        const data = document.data();
        const dramas = await document.ref.collection("drama").get();
        return {
          docId: document.id,
          week: String(data.createdWeek || document.id.slice(3)),
          itemCount: dramas.size,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        };
      }));
      schedules.sort((a, b) => b.week.localeCompare(a.week));
      return Response.json({ countryCode: requestedCountry, schedules });
    }
    const { country, ref } = target(requestedCountry, requestedDocId);
    const [parent, snapshot] = await Promise.all([ref.get(), ref.collection("drama").get()]);
    const parentData = parent.data();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return Response.json({ countryCode: country, week: parentData?.createdWeek || ref.id.slice(3), docId: ref.id, exists: parent.exists, items });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }, { status: 400 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json() as DramaInput;
    const { country, week, ref } = target(body.countryCode, body.docId);
    const parent = await ref.get();
    await ref.set({
      countryCode: country,
      createdWeek: week,
      ...(!parent.exists ? { createdAt: Timestamp.now() } : {}),
    }, { merge: true });
    const added = await ref.collection("drama").add(clean(body));
    return Response.json({ id: added.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "추가하지 못했습니다." }, { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json() as DramaInput;
    if (!body.id) throw new Error("수정할 항목 ID가 없습니다.");
    const { ref } = target(body.countryCode, body.docId);
    await ref.collection("drama").doc(body.id).update(clean(body));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "수정하지 못했습니다." }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json() as DramaInput;
    if (!body.id) throw new Error("삭제할 항목 ID가 없습니다.");
    const { ref } = target(body.countryCode, body.docId);
    await ref.collection("drama").doc(body.id).delete();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 400 });
  }
};
