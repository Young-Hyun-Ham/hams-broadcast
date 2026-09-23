import type { APIRoute } from "astro";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { itemDocumentId } from "../../../services/dramaCatalogStore";

export const prerender = false;

function responseItem(document: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const { thumbnailImageData, ...data } = document.data()! as Record<string, unknown>;
  return { id: document.id, ...data, hasThumbnailImageData: Boolean(thumbnailImageData) };
}

async function loadItems(documents: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (!documents.length) return [];
  const references = documents.map((document) => db.collection("catalogItems").doc(document.id));
  const snapshots: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let start = 0; start < references.length; start += 300) {
    snapshots.push(...await db.getAll(...references.slice(start, start + 300)));
  }
  return snapshots.filter((snapshot) => snapshot.exists).map(responseItem);
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const categoryKey = String(url.searchParams.get("category") || "");
    if (!getCatalogCategory(categoryKey)) throw new Error("지원하지 않는 카테고리입니다.");
    const state = await db.collection("catalogState").doc(categoryKey).get();
    if (!state.exists) return Response.json({ documentId: "", page: 1, total: 0, items: [] });
    const documentId = String(state.data()?.lastSuccessfulRunId || categoryKey);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const query = String(url.searchParams.get("q") || "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
    const collection = state.ref.collection("items");
    if (query) {
      const snapshot = await collection.orderBy("order").get();
      const allItems = await loadItems(snapshot.docs);
      const matches = allItems.filter((value) => String(value.title || "").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query));
      return Response.json({ documentId, page, total: matches.length, items: matches.slice((page - 1) * 10, page * 10) });
    }
    const snapshot = await collection.orderBy("order").offset((page - 1) * 10).limit(10).get();
    return Response.json({ documentId, page, total: Number(state.data()?.itemCount || 0), items: await loadItems(snapshot.docs) });
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
  return { title, thumbnailUrl: String(body.thumbnailUrl || "").trim(),
    genres: String(body.genres || "").split(",").map((value) => value.trim()).filter(Boolean),
    rating: body.rating === "" || body.rating == null ? null : Number(body.rating),
    synopsis: String(body.synopsis || "").trim(), characters, isUpdated: Boolean(body.isUpdated), updatedAt: Timestamp.now() };
}

function targetState(body: Record<string, unknown>) {
  const categoryKey = String(body.category || "");
  if (!getCatalogCategory(categoryKey)) throw new Error("지원하지 않는 카테고리입니다.");
  return { categoryKey, state: db.collection("catalogState").doc(categoryKey) };
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json();
    const { categoryKey, state } = targetState(body);
    const value = clean(body);
    const stateSnapshot = await state.get();
    const order = Number(stateSnapshot.data()?.itemCount || 0) + 1;
    const seed = { ...value, detailKey: `manual-${Date.now()}` };
    const ref = db.collection("catalogItems").doc(itemDocumentId(seed as never, categoryKey));
    if ((await ref.get()).exists) throw new Error("같은 카테고리에 동일한 제목의 작품이 이미 있습니다.");
    const batch = db.batch();
    batch.set(ref, { ...seed, category: categoryKey, createdAt: Timestamp.now() });
    batch.set(state.collection("items").doc(ref.id), { order, sourcePage: Math.ceil(order / 24), sourceOrder: ((order - 1) % 24) + 1, itemRef: ref });
    batch.set(state, { category: categoryKey, itemCount: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
    await batch.commit();
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "추가하지 못했습니다." }, { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json();
    targetState(body);
    const id = String(body.id || "");
    if (!id) throw new Error("수정 대상이 없습니다.");
    await db.collection("catalogItems").doc(id).update(clean(body));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "수정하지 못했습니다." }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json();
    const { state } = targetState(body);
    const id = String(body.id || "");
    if (!id) throw new Error("삭제 대상이 없습니다.");
    const batch = db.batch();
    batch.delete(state.collection("items").doc(id));
    batch.delete(db.collection("catalogItems").doc(id));
    batch.set(state, { itemCount: FieldValue.increment(-1), updatedAt: Timestamp.now() }, { merge: true });
    await batch.commit();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 400 });
  }
};
