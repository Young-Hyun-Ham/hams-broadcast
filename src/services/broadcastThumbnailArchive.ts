import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";

const MAX_IMAGE_BYTES = 650_000;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".avif": "image/avif",
};

function imageMimeFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const extension = Object.keys(IMAGE_MIME_BY_EXTENSION).find((item) => pathname.endsWith(item));
    return extension ? IMAGE_MIME_BY_EXTENSION[extension] : "";
  } catch { return ""; }
}

export async function archiveBroadcastThumbnails(documentId: string, collectionName = "drama") {
  const snapshot = await db.collection(collectionName).doc(documentId).collection("items").orderBy("globalOrder").get();
  const targets = snapshot.docs.filter((document) => {
    const item = document.data();
    return Boolean(imageMimeFromUrl(String(item.thumbnailUrl || ""))) && !item.thumbnailImageData;
  });
  let updated = 0;
  const failures: Array<{ id: string; title: string; error: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const document = targets[cursor++];
      const item = document.data();
      try {
        const response = await fetch(String(item.thumbnailUrl), {
          headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*", "User-Agent": "Mozilla/5.0 (compatible; HamsBroadcast/1.0; thumbnail archive)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`이미지 응답 오류 (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error("이미지 데이터가 비어 있습니다.");
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`이미지가 저장 제한(${Math.round(MAX_IMAGE_BYTES / 1000)}KB)을 초과합니다.`);
        const responseMime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
        const thumbnailImageMime = responseMime.startsWith("image/") ? responseMime : imageMimeFromUrl(String(item.thumbnailUrl));
        if (!thumbnailImageMime) throw new Error("지원하는 이미지 형식이 아닙니다.");
        await document.ref.update({ thumbnailImageData: bytes.toString("base64"), thumbnailImageMime, thumbnailImageSize: bytes.length,
          thumbnailImageStoredAt: Timestamp.now(), updatedAt: Timestamp.now() });
        updated += 1;
      } catch (error) {
        failures.push({ id: document.id, title: String(item.title || ""), error: error instanceof Error ? error.message : "이미지 저장에 실패했습니다." });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, targets.length) }, () => worker()));
  return { targetCount: targets.length, updated, failed: failures.length, failures };
}
