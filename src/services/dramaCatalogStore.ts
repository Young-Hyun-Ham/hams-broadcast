import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";
import type { CatalogBroadcast, CatalogBroadcastDetail } from "../utils/tvhotBroadcastCatalog";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_TOTAL_PAGES = 31;

export type StoredCatalogDrama = CatalogBroadcast & {
  sourcePage: number;
  sourceOrder: number;
  globalOrder: number;
  synopsis?: string;
  posterUrl?: string;
  information?: Record<string, string>;
  cast?: CatalogBroadcastDetail["cast"];
  characters?: Array<{ name: string; actor: string; imageUrl: string }>;
  thumbnailImageData?: string;
  thumbnailImageMime?: string;
  thumbnailImageSize?: number;
};

function koreaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("-", "");
}

export function itemDocumentId(item: CatalogBroadcast) {
  const title = item.title.normalize("NFKC").replace(/[\/#?\[\]*]/g, " ").replace(/\s+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "untitled";
  const key = createHash("sha256").update(item.detailKey).digest("hex").slice(0, 12);
  return `${title}-${key}`;
}

export async function createHistory(type: "catalog" | "detail" | "migration" | "thumbnail", fields: Record<string, unknown> = {}) {
  const ref = db.collection("dramaHistory").doc();
  await ref.set({ type, status: "processing", requestedAt: Timestamp.now(), ...fields });
  return ref;
}

export async function nextCatalogDocumentId() {
  const date = koreaDate();
  const counterRef = db.collection("dramaCatalogMeta").doc("generation-counter");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const sequence = String(snapshot.data()?.date || "") === date ? Number(snapshot.data()?.sequence || 0) + 1 : 1;
    transaction.set(counterRef, { date, sequence, updatedAt: Timestamp.now() });
    return `${date}-${String(sequence).padStart(3, "0")}`;
  });
}

async function writeItemDocuments(documentId: string, items: StoredCatalogDrama[]) {
  const parent = db.collection("drama").doc(documentId);
  for (let start = 0; start < items.length; start += 400) {
    const batch = db.batch();
    items.slice(start, start + 400).forEach((item) => {
      batch.set(parent.collection("items").doc(itemDocumentId(item)), { ...item, updatedAt: Timestamp.now() });
    });
    await batch.commit();
  }
}

export async function saveCatalogDocument(documentId: string, items: StoredCatalogDrama[]) {
  const parent = db.collection("drama").doc(documentId);
  await parent.set({ catalogDate: documentId.slice(0, 8), sequence: Number(documentId.slice(9)), itemCount: items.length,
    totalPages: CATALOG_TOTAL_PAGES, schemaVersion: 2, status: "processing", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await writeItemDocuments(documentId, items);
  const batch = db.batch();
  batch.update(parent, { status: "ready", updatedAt: Timestamp.now() });
  batch.set(db.collection("dramaCatalogMeta").doc("current"), { documentId, itemCount: items.length, updatedAt: Timestamp.now() });
  await batch.commit();
}

export async function loadLatestCatalogDocument() {
  const [current, counter] = await Promise.all([
    db.collection("dramaCatalogMeta").doc("current").get(), db.collection("dramaCatalogMeta").doc("generation-counter").get(),
  ]);
  const counterData = counter.data();
  const fallbackId = counterData?.date && counterData?.sequence ? `${counterData.date}-${String(counterData.sequence).padStart(3, "0")}` : "";
  const latestId = String(current.data()?.documentId || fallbackId);
  if (!latestId) return null;
  const document = await db.collection("drama").doc(latestId).get();
  return document.exists ? { documentId: document.id, data: document.data()! } : null;
}

export async function loadCatalogPage(documentId: string, page: number) {
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const snapshot = await db.collection("drama").doc(documentId).collection("items")
    .orderBy("globalOrder").offset(start).limit(CATALOG_PAGE_SIZE).get();
  return snapshot.docs.map((document) => ({ ...document.data() as StoredCatalogDrama, itemDocumentId: document.id }));
}

export async function loadCatalogItem(documentId: string, itemId: string) {
  if (!/^\d{8}-\d{3}$/.test(documentId) || !itemId || itemId.includes("/")) throw new Error("잘못된 작품 식별자입니다.");
  const ref = db.collection("drama").doc(documentId).collection("items").doc(itemId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("저장된 작품 정보를 찾을 수 없습니다.");
  return { ref, item: snapshot.data() as StoredCatalogDrama };
}

export function storedDetail(item: StoredCatalogDrama): CatalogBroadcastDetail {
  return { synopsis: String(item.synopsis || ""), posterUrl: String(item.posterUrl || item.thumbnailUrl || ""),
    genres: Array.isArray(item.genres) ? item.genres.map(String) : [], information: item.information && typeof item.information === "object" ? item.information : {},
    cast: Array.isArray(item.cast) ? item.cast : [] };
}

export async function updateDramaDetail(documentId: string, itemId: string, detail: CatalogBroadcastDetail) {
  const { ref } = await loadCatalogItem(documentId, itemId);
  const characters = detail.cast.map((person) => ({ name: "", actor: person.name, imageUrl: person.imageUrl }));
  await ref.set({ ...detail, characters, detailCrawledAt: Timestamp.now(), updatedAt: Timestamp.now() }, { merge: true });
  return { ...detail, characters };
}

export async function migrateLatestCatalogToSubcollection() {
  const catalog = await loadLatestCatalogDocument();
  if (!catalog) throw new Error("마이그레이션할 드라마 문서가 없습니다.");
  const items = Array.isArray(catalog.data.items) ? catalog.data.items as StoredCatalogDrama[] : [];
  if (!items.length) return { documentId: catalog.documentId, itemCount: Number(catalog.data.itemCount || 0), migrated: false };
  await writeItemDocuments(catalog.documentId, items);
  await db.collection("drama").doc(catalog.documentId).update({ items: FieldValue.delete(), schemaVersion: 2, status: "ready", updatedAt: Timestamp.now() });
  return { documentId: catalog.documentId, itemCount: items.length, migrated: true };
}
