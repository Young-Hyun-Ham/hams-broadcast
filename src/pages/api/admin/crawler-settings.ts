import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";

export const prerender = false;
const fields = [
  "drama",
  "oldDrama",
  "entertainment",
  "currentAffairs",
  "oldEntertainment",
  "worldDrama",
  "overseasEntertainment",
  "generalAnime",
  "animatedMovie",
  "koreanMovie",
  "foreignMovie",
] as const;

function normalize(value: unknown) {
  const url = new URL(String(value || "").trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("http 또는 https 주소만 사용할 수 있습니다.");
  return url.href.replace(/\/$/, "");
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  const snapshot = await db.collection("crawlerSettings").doc("sources").get();
  return Response.json({ settings: {
    drama: import.meta.env.DRAMA_CATALOG_SOURCE_URL || "https://tvhot2.com",
    oldDrama: "", entertainment: "", currentAffairs: "", oldEntertainment: "",
    worldDrama: "", overseasEntertainment: "", generalAnime: "", animatedMovie: "",
    koreanMovie: "", foreignMovie: "", ...snapshot.data(),
  } });
};

export const PUT: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json();
    const settings = Object.fromEntries(fields.map((field) => [field, body[field] ? normalize(body[field]) : ""]));
    await db.collection("crawlerSettings").doc("sources").set({ ...settings, updatedAt: Timestamp.now() }, { merge: true });
    return Response.json({ settings });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 400 }); }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json();
    const url = normalize(body.url);
    const response = await fetch(url, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (compatible; HamsBroadcast/1.0; source validation)" }, signal: AbortSignal.timeout(8_000) });
    return Response.json({ ok: response.ok, status: response.status, url }, { status: response.ok ? 200 : 422 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "주소를 확인하지 못했습니다." }, { status: 400 }); }
};
