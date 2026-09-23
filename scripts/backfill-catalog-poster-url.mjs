import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const serviceAccount = JSON.parse(
  await readFile(new URL("../service-account.json", import.meta.url), "utf8"),
);
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

let scanned = 0;
let eligible = 0;
let updated = 0;
let unchanged = 0;
let missingThumbnailUrl = 0;
let cursor;
const writer = apply ? db.bulkWriter() : null;

writer?.onWriteError((error) => error.failedAttempts < 3);

do {
  let query = db.collection("catalogItems")
    .orderBy(FieldPath.documentId())
    .limit(300);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();

  for (const document of snapshot.docs) {
    scanned += 1;
    const data = document.data();
    const thumbnailUrl = String(data.thumbnailUrl || "").trim();
    if (!thumbnailUrl) {
      missingThumbnailUrl += 1;
      continue;
    }
    if (String(data.posterUrl || "").trim() === thumbnailUrl) {
      unchanged += 1;
      continue;
    }
    eligible += 1;
    if (writer) {
      writer.update(document.ref, {
        posterUrl: thumbnailUrl,
        updatedAt: Timestamp.now(),
      });
      updated += 1;
    }
  }

  cursor = snapshot.docs.at(-1);
} while (cursor && scanned % 300 === 0);

await writer?.close();

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scanned,
  eligible,
  updated,
  unchanged,
  missingThumbnailUrl,
}, null, 2));
