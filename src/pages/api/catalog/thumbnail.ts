import type { APIRoute } from "astro";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  try {
    const category = getCatalogCategory(
      String(url.searchParams.get("category") || "drama"),
    );
    const documentId = String(url.searchParams.get("documentId") || "");
    const itemId = String(url.searchParams.get("itemId") || "");
    if (!category || !documentId || !itemId) throw new Error();
    const snapshot = await (documentId === String(url.searchParams.get("category") || "drama")
      ? db.collection("catalogItems").doc(itemId)
      : db.collection(category.collection).doc(documentId).collection("items").doc(itemId)).get();
    const data = snapshot.data();
    if (!data?.thumbnailImageData) throw new Error();
    return new Response(
      Buffer.from(String(data.thumbnailImageData), "base64"),
      {
        headers: {
          "Content-Type": String(data.thumbnailImageMime || "image/webp"),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
};
