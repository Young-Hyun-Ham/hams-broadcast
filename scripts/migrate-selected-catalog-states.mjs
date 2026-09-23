import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

const categories = [
  { key: "korean-movie", collection: "koreanMovie" },
  { key: "foreign-movie", collection: "foreignMovie" },
  { key: "anime", collection: "generalAnime" },
  { key: "entertainment", collection: "entertainment" },
];

const serviceAccount = JSON.parse(
  await readFile(new URL("../service-account.json", import.meta.url), "utf8"),
);
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function latestCatalog(collection) {
  const meta = db.collection(`${collection}CatalogMeta`);
  const [current, counter] = await Promise.all([
    meta.doc("current").get(),
    meta.doc("generation-counter").get(),
  ]);
  const counterData = counter.data();
  const fallbackId = counterData?.date && counterData?.sequence
    ? `${counterData.date}-${String(counterData.sequence).padStart(3, "0")}`
    : "";
  const documentId = String(current.data()?.documentId || fallbackId);
  if (!documentId) throw new Error(`${collection}에 마이그레이션할 카탈로그가 없습니다.`);
  const parent = await db.collection(collection).doc(documentId).get();
  if (!parent.exists) throw new Error(`${collection}/${documentId} 문서가 없습니다.`);
  return documentId;
}

async function loadItems(collection, documentId) {
  const result = [];
  let cursor;
  do {
    let query = db.collection(collection).doc(documentId).collection("items")
      .orderBy(FieldPath.documentId()).limit(500);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    result.push(...snapshot.docs);
    cursor = snapshot.docs.at(-1);
  } while (cursor && result.length % 500 === 0);
  return result;
}

async function migrateCategory({ key, collection }) {
  const documentId = await latestCatalog(collection);
  const sourceItems = await loadItems(collection, documentId);
  if (!sourceItems.length) throw new Error(`${collection}/${documentId}/items가 비어 있습니다.`);

  const stateRef = db.collection("catalogState").doc(key);
  const migratedAt = Timestamp.now();
  for (let start = 0; start < sourceItems.length; start += 200) {
    const batch = db.batch();
    for (const source of sourceItems.slice(start, start + 200)) {
      const data = source.data();
      const catalogItemRef = db.collection("catalogItems").doc(source.id);
      batch.set(catalogItemRef, {
        ...data,
        category: key,
        legacyDocumentId: documentId,
        legacyItemPath: source.ref.path,
        migratedAt,
      }, { merge: true });
      batch.set(stateRef.collection("items").doc(source.id), {
        order: Number(data.globalOrder || 0),
        sourcePage: Number(data.sourcePage || 0),
        sourceOrder: Number(data.sourceOrder || 0),
        itemRef: catalogItemRef,
      }, { merge: true });
    }
    await batch.commit();
    console.log(`${key}: ${Math.min(start + 200, sourceItems.length)}/${sourceItems.length}`);
  }
  await stateRef.set({
    category: key,
    itemCount: sourceItems.length,
    lastSuccessfulRunId: documentId,
    sourceCollection: `${collection}/${documentId}/items`,
    migratedAt,
    updatedAt: migratedAt,
  }, { merge: true });
  return {
    category: key,
    source: `${collection}/${documentId}/items`,
    catalogItemsCopied: sourceItems.length,
    stateItemsCopied: sourceItems.length,
    legacyDataDeleted: false,
  };
}

const results = [];
for (const category of categories) {
  try {
    results.push({ ok: true, ...await migrateCategory(category) });
  } catch (error) {
    results.push({ ok: false, category: category.key, error: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify({ results }, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;
