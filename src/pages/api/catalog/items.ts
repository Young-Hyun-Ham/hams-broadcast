import type { APIRoute } from "astro";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";

export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const categoryKey = String(url.searchParams.get("category") || "drama");
  const category = getCatalogCategory(categoryKey);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  if (!category)
    return Response.json(
      { error: "지원하지 않는 카테고리입니다.", items: [] },
      { status: 400 },
    );
  try {
    const meta = db.collection(`${category.collection}CatalogMeta`);
    const [current, counter] = await Promise.all([
      meta.doc("current").get(),
      meta.doc("generation-counter").get(),
    ]);
    const counterData = counter.data();
    const fallbackDocumentId =
      counterData?.date && counterData?.sequence
        ? `${counterData.date}-${String(counterData.sequence).padStart(3, "0")}`
        : "";
    const documentId = String(
      current.data()?.documentId || fallbackDocumentId,
    );
    if (!documentId)
      return Response.json({
        category: categoryKey,
        title: category.title,
        page,
        totalPages: 1,
        items: [],
      });
    const parent = db.collection(category.collection).doc(documentId);
    const parentSnapshot = await parent.get();
    const total = Number(
      parentSnapshot.data()?.itemCount || current.data()?.itemCount || 0,
    );
    const snapshot = await parent
      .collection("items")
      .orderBy("globalOrder")
      .offset((page - 1) * 24)
      .limit(24)
      .get();
    const items = snapshot.docs.map((document) => {
      const { thumbnailImageData, ...item } = document.data();
      return {
        ...item,
        itemDocumentId: document.id,
        catalogDocumentId: documentId,
        hasThumbnailImageData: Boolean(thumbnailImageData),
      };
    });
    return Response.json(
      {
        category: categoryKey,
        title: category.title,
        documentId,
        page,
        totalPages: Math.max(1, Math.ceil(total / 24)),
        total,
        items,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "목록을 불러오지 못했습니다.",
        items: [],
      },
      { status: 500 },
    );
  }
};
