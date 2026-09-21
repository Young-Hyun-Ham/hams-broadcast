import type { APIRoute } from "astro";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { itemDocumentId, loadLatestCatalogDocument } from "../../../services/dramaCatalogStore";

export const prerender = false;

function responseItem(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const { thumbnailImageData, ...item } = document.data();
  return { id: document.id, ...item, hasThumbnailImageData: Boolean(thumbnailImageData) };
}

function clean(body: Record<string, unknown>) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("드라마 제목은 필수입니다.");
  const characters = Array.isArray(body.characters) ? body.characters.map((value) => {
    const person = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { name: String(person.name || "").trim(), actor: String(person.actor || "").trim(), imageUrl: String(person.imageUrl || "").trim() };
  }).filter((person) => person.name || person.actor) : [];
  return { title, thumbnailUrl: String(body.thumbnailUrl || "").trim(), genres: String(body.genres || "").split(",").map((v) => v.trim()).filter(Boolean), rating: body.rating === "" || body.rating == null ? null : Number(body.rating), isUpdated: Boolean(body.isUpdated), synopsis: String(body.synopsis || "").trim(), characters, updatedAt: Timestamp.now() };
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const catalog = await loadLatestCatalogDocument(); if (!catalog) throw new Error("생성된 드라마 목록이 없습니다.");
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const limit = 10;
    const query = String(url.searchParams.get("q") || "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
    const collection = db.collection("drama").doc(catalog.documentId).collection("items");
    if (query) {
      const snapshot = await collection.orderBy("globalOrder").get();
      const matches = snapshot.docs.filter((doc) => String(doc.data().title || "").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query));
      return Response.json({ documentId: catalog.documentId, page, query, total: matches.length, items: matches.slice((page - 1) * limit, page * limit).map(responseItem) });
    }
    const snapshot = await collection.orderBy("globalOrder").offset((page - 1) * limit).limit(limit).get();
    return Response.json({ documentId: catalog.documentId, page, query, total: Number(catalog.data.itemCount || 0), items: snapshot.docs.map(responseItem) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }, { status: 400 }); }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json(); const catalog = await loadLatestCatalogDocument(); if (!catalog) throw new Error("생성된 드라마 목록이 없습니다.");
    const value = clean(body); const globalOrder = Number(catalog.data.itemCount || 0) + 1;
    const seed = { ...value, detailKey: `manual-${Date.now()}` };
    const ref = db.collection("drama").doc(catalog.documentId).collection("items").doc(itemDocumentId(seed as never));
    await ref.set({ ...seed, sourcePage: Math.ceil(globalOrder / 24), sourceOrder: ((globalOrder - 1) % 24) + 1, globalOrder, cast: [], createdAt: Timestamp.now() });
    await db.collection("drama").doc(catalog.documentId).update({ itemCount: FieldValue.increment(1), updatedAt: Timestamp.now() });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "추가하지 못했습니다." }, { status: 400 }); }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try { const body = await request.json(); if (!body.documentId || !body.id) throw new Error("수정 대상이 없습니다."); await db.collection("drama").doc(body.documentId).collection("items").doc(body.id).update(clean(body)); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "수정하지 못했습니다." }, { status: 400 }); }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try { const body = await request.json(); if (!body.documentId || !body.id) throw new Error("삭제 대상이 없습니다."); await db.collection("drama").doc(body.documentId).collection("items").doc(body.id).delete(); await db.collection("drama").doc(body.documentId).update({ itemCount: FieldValue.increment(-1), updatedAt: Timestamp.now() }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 400 }); }
};
