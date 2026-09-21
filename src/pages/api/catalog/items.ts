import type { APIRoute } from "astro";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";

export const prerender = false;
const PAGE_SIZE = 24;

function normalizeSearch(value: unknown) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

export const GET: APIRoute = async ({ url }) => {
  const categoryKey = String(url.searchParams.get("category") || "drama");
  const category = getCatalogCategory(categoryKey);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const query = normalizeSearch(url.searchParams.get("q"));
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
    const collection = parent.collection("items");
    let total = Number(parentSnapshot.data()?.itemCount || current.data()?.itemCount || 0);
    let documents: FirebaseFirestore.QueryDocumentSnapshot[];
    if (query) {
      const snapshot = await collection.orderBy("globalOrder").get();
      const matches = snapshot.docs.filter((document) => {
        const item = document.data();
        const genres = Array.isArray(item.genres) ? item.genres.join(" ") : "";
        return normalizeSearch(`${item.title || ""} ${genres}`).includes(query);
      });
      total = matches.length;
      documents = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    } else {
      const snapshot = await collection
        .orderBy("globalOrder")
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get();
      documents = snapshot.docs;
    }
    const items = documents.map((document) => {
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
        query,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
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
