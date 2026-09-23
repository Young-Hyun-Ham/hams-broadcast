import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(
  await readFile(new URL("../service-account.json", import.meta.url), "utf8"),
);

const app =
  getApps()[0] ||
  initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function latestDramaCatalog() {
  const meta = db.collection("dramaCatalogMeta");
  const [current, counter] = await Promise.all([
    meta.doc("current").get(),
    meta.doc("generation-counter").get(),
  ]);
  const counterData = counter.data();
  const fallbackId =
    counterData?.date && counterData?.sequence
      ? `${counterData.date}-${String(counterData.sequence).padStart(3, "0")}`
      : "";
  const documentId = String(current.data()?.documentId || fallbackId);
  if (!documentId) throw new Error("마이그레이션할 드라마 카탈로그가 없습니다.");

  const parent = await db.collection("drama").doc(documentId).get();
  if (!parent.exists) throw new Error(`drama/${documentId} 문서가 없습니다.`);
  return { documentId, parent };
}

async function loadItems(documentId) {
  const result = [];
  let cursor;
  do {
    let query = db
      .collection("drama")
      .doc(documentId)
      .collection("items")
      .orderBy(FieldPath.documentId())
      .limit(500);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    result.push(...snapshot.docs);
    cursor = snapshot.docs.at(-1);
  } while (cursor && result.length % 500 === 0);
  return result;
}

const { documentId, parent } = await latestDramaCatalog();
const sourceItems = await loadItems(documentId);
if (!sourceItems.length) throw new Error(`drama/${documentId}/items가 비어 있습니다.`);

const stateRef = db.collection("catalogState").doc("drama");
const migratedAt = Timestamp.now();
const writer = db.bulkWriter();
let copied = 0;

writer.onWriteError((error) => error.failedAttempts < 3);

for (const source of sourceItems) {
  const data = source.data();
  const catalogItemRef = db.collection("catalogItems").doc(source.id);
  const stateItemRef = stateRef.collection("items").doc(source.id);

  writer.set(
    catalogItemRef,
    {
      ...data,
      category: "drama",
      legacyDocumentId: documentId,
      legacyItemPath: source.ref.path,
      migratedAt,
    },
    { merge: true },
  );
  writer.set(
    stateItemRef,
    {
      order: Number(data.globalOrder || 0),
      sourcePage: Number(data.sourcePage || 0),
      sourceOrder: Number(data.sourceOrder || 0),
      itemRef: catalogItemRef,
    },
    { merge: true },
  );
  copied += 1;
}

await writer.close();
await stateRef.set(
  {
    category: "drama",
    itemCount: copied,
    lastSuccessfulRunId: documentId,
    sourceCollection: `drama/${documentId}/items`,
    migratedAt,
    updatedAt: migratedAt,
  },
  { merge: true },
);

console.log(
  JSON.stringify(
    {
      ok: true,
      source: `drama/${documentId}/items`,
      catalogItemsCopied: copied,
      stateItemsCopied: copied,
      legacyDataDeleted: false,
    },
    null,
    2,
  ),
);
