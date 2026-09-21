import type { APIRoute } from "astro";
import { catalogCategories, type CatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";

export const prerender = false;
const TOP_LIMIT = 10;

async function loadCategoryTop(categoryKey: CatalogCategory) {
  const category = catalogCategories[categoryKey];
  const meta = db.collection(`${category.collection}CatalogMeta`);
  const [current, counter] = await Promise.all([meta.doc("current").get(), meta.doc("generation-counter").get()]);
  const counterData = counter.data();
  const fallbackDocumentId = counterData?.date && counterData?.sequence
    ? `${counterData.date}-${String(counterData.sequence).padStart(3, "0")}` : "";
  const documentId = String(current.data()?.documentId || fallbackDocumentId);
  if (!documentId) return { category: categoryKey, title: category.title, items: [] };

  const snapshot = await db.collection(category.collection).doc(documentId).collection("items")
    .orderBy("globalOrder").limit(TOP_LIMIT).get();
  const items = snapshot.docs.map((document) => {
    const { thumbnailImageData, ...item } = document.data();
    return { ...item, itemDocumentId: document.id, catalogDocumentId: documentId, hasThumbnailImageData: Boolean(thumbnailImageData) };
  });
  return { category: categoryKey, title: category.title, documentId, items };
}

export const GET: APIRoute = async () => {
  try {
    const keys = Object.keys(catalogCategories) as CatalogCategory[];
    const categories = await Promise.all(keys.map(loadCategoryTop));
    return Response.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "카테고리별 TOP 10을 불러오지 못했습니다.", categories: [] }, { status: 500 });
  }
};
