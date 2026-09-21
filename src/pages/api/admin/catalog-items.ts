import type { APIRoute } from "astro";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { itemDocumentId } from "../../../services/dramaCatalogStore";

export const prerender = false;

function item(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const { thumbnailImageData, ...data } = document.data();
  return { id: document.id, ...data, hasThumbnailImageData: Boolean(thumbnailImageData) };
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const categoryKey = String(url.searchParams.get("category") || "");
    const category = getCatalogCategory(categoryKey);
    if (!category) throw new Error("지원하지 않는 카테고리입니다.");
    const current = await db.collection(`${category.collection}CatalogMeta`).doc("current").get();
    const documentId = String(current.data()?.documentId || "");
    if (!documentId) return Response.json({ documentId: "", page: 1, total: 0, items: [] });
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const query = String(url.searchParams.get("q") || "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
    const collection = db.collection(category.collection).doc(documentId).collection("items");
    if (query) {
      const snapshot = await collection.orderBy("globalOrder").get();
      const matches = snapshot.docs.filter((document) => String(document.data().title || "").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query));
      return Response.json({ documentId, page, total: matches.length, items: matches.slice((page - 1) * 10, page * 10).map(item) });
    }
    const [parent, snapshot] = await Promise.all([db.collection(category.collection).doc(documentId).get(), collection.orderBy("globalOrder").offset((page - 1) * 10).limit(10).get()]);
    return Response.json({ documentId, page, total: Number(parent.data()?.itemCount || 0), items: snapshot.docs.map(item) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }, { status: 400 });
  }
};

function clean(body: Record<string, unknown>) {
  const title = String(body.title || "").trim();
  if (!title) throw new Error("제목은 필수입니다.");
  const characters = Array.isArray(body.characters) ? body.characters.map((value) => {
    const person = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { name: String(person.name || "").trim(), actor: String(person.actor || "").trim(), imageUrl: String(person.imageUrl || "").trim() };
  }).filter((person) => person.name || person.actor) : [];
  return { title, thumbnailUrl: String(body.thumbnailUrl || "").trim(), genres: String(body.genres || "").split(",").map((value) => value.trim()).filter(Boolean),
    rating: body.rating === "" || body.rating == null ? null : Number(body.rating), synopsis: String(body.synopsis || "").trim(), characters,
    isUpdated: Boolean(body.isUpdated), updatedAt: Timestamp.now() };
}

async function target(body: Record<string, unknown>) {
  const category = getCatalogCategory(String(body.category || ""));
  if (!category) throw new Error("지원하지 않는 카테고리입니다.");
  const documentId = String(body.documentId || "");
  if (!documentId) throw new Error("생성된 목록 문서가 없습니다.");
  return { category, documentId, parent: db.collection(category.collection).doc(documentId) };
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json(); const { parent } = await target(body); const value = clean(body); const parentSnapshot = await parent.get();
    const globalOrder = Number(parentSnapshot.data()?.itemCount || 0) + 1; const seed = { ...value, detailKey: `manual-${Date.now()}` };
    const ref = parent.collection("items").doc(itemDocumentId(seed as never));
    await ref.set({ ...seed, sourcePage: Math.ceil(globalOrder / 24), sourceOrder: ((globalOrder - 1) % 24) + 1, globalOrder, createdAt: Timestamp.now() });
    await parent.update({ itemCount: FieldValue.increment(1), updatedAt: Timestamp.now() });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "추가하지 못했습니다." }, { status: 400 }); }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try { const body = await request.json(); const { parent } = await target(body); const id = String(body.id || ""); if (!id) throw new Error("수정 대상이 없습니다."); await parent.collection("items").doc(id).update(clean(body)); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "수정하지 못했습니다." }, { status: 400 }); }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try { const body = await request.json(); const { parent } = await target(body); const id = String(body.id || ""); if (!id) throw new Error("삭제 대상이 없습니다."); await parent.collection("items").doc(id).delete(); await parent.update({ itemCount: FieldValue.increment(-1), updatedAt: Timestamp.now() }); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 400 }); }
};
