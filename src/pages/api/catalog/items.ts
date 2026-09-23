import type { APIRoute } from "astro";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";

export const prerender = false;
const PAGE_SIZE = 24;

function normalizeSearch(value: unknown) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

async function loadStateItems(
  stateDocuments: FirebaseFirestore.QueryDocumentSnapshot[],
  categoryKey: string,
): Promise<Array<Record<string, unknown>>> {
  if (!stateDocuments.length) return [];
  const references = stateDocuments.map((document) => {
    const itemRef = document.data().itemRef;
    return itemRef && typeof itemRef.path === "string"
      ? (itemRef as FirebaseFirestore.DocumentReference)
      : db.collection("catalogItems").doc(document.id);
  });
  const snapshots: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let start = 0; start < references.length; start += 300) {
    snapshots.push(...await db.getAll(...references.slice(start, start + 300)));
  }
  const itemsById = new Map(
    snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, snapshot]),
  );
  return stateDocuments.flatMap((stateDocument) => {
    const snapshot = itemsById.get(stateDocument.id);
    if (!snapshot) return [];
    const { thumbnailImageData, ...item } = snapshot.data()! as Record<string, unknown>;
    const state = stateDocument.data();
    return [{
      ...item,
      globalOrder: Number(state.order || item.globalOrder || 0),
      sourcePage: Number(state.sourcePage || item.sourcePage || 0),
      sourceOrder: Number(state.sourceOrder || item.sourceOrder || 0),
      itemDocumentId: snapshot.id,
      catalogDocumentId: String(item.legacyDocumentId || categoryKey),
      hasThumbnailImageData: Boolean(thumbnailImageData),
    } as Record<string, unknown>];
  });
}

async function loadStateCatalog(categoryKey: string, title: string, page: number, query: string) {
  const stateRef = db.collection("catalogState").doc(categoryKey);
  const stateSnapshot = await stateRef.get();
  if (!stateSnapshot.exists) return null;
  const stateData = stateSnapshot.data()!;
  const collection = stateRef.collection("items");
  let total = Number(stateData.itemCount || 0);
  let items;
  if (query) {
    const stateItems = await collection.orderBy("order").get();
    const allItems = await loadStateItems(stateItems.docs, categoryKey);
    const matches = allItems.filter((item) => {
      const genres = Array.isArray(item.genres) ? item.genres.join(" ") : "";
      return normalizeSearch(`${String(item.title || "")} ${genres}`).includes(query);
    });
    total = matches.length;
    items = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    const stateItems = await collection.orderBy("order")
      .offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).get();
    items = await loadStateItems(stateItems.docs, categoryKey);
  }
  return {
    category: categoryKey,
    title,
    documentId: String(stateData.lastSuccessfulRunId || categoryKey),
    page,
    query,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    items,
  };
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
    const stateResult = await loadStateCatalog(categoryKey, category.title, page, query);
    if (stateResult) return Response.json(stateResult, { headers: { "Cache-Control": "no-store" } });
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
