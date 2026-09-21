import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { CATALOG_PAGE_SIZE, CATALOG_TOTAL_PAGES, createHistory, nextCatalogDocumentId, saveCatalogDocument, type StoredCatalogDrama } from "../../../services/dramaCatalogStore";
import { fetchDramaCatalog } from "../../../utils/tvhotBroadcastCatalog";

export const prerender = false;

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, task: (value: T) => Promise<R>) {
  const results: R[] = new Array(values.length); let cursor = 0;
  async function worker() { while (cursor < values.length) { const index = cursor++; results[index] = await task(values[index]); } }
  await Promise.all(Array.from({ length: concurrency }, worker)); return results;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  const history = await createHistory("catalog", { totalPages: CATALOG_TOTAL_PAGES });
  try {
    const settings = await db.collection("crawlerSettings").doc("sources").get();
    const sourceOrigin = String(settings.data()?.drama || import.meta.env.DRAMA_CATALOG_SOURCE_URL || "https://tvhot2.com");
    const pages = Array.from({ length: CATALOG_TOTAL_PAGES }, (_, index) => index + 1);
    const pageItems = await mapWithConcurrency(pages, 2, async (page) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try { return { page, items: await fetchDramaCatalog(page, sourceOrigin) }; }
        catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
        }
      }
      throw lastError;
    });
    const items: StoredCatalogDrama[] = pageItems.flatMap(({ page, items }) => items.map((item, index) => ({ ...item, sourcePage: page, sourceOrder: index + 1, globalOrder: (page - 1) * CATALOG_PAGE_SIZE + index + 1 })));
    const documentId = await nextCatalogDocumentId();
    await saveCatalogDocument(documentId, items);
    await history.update({ status: "success", documentId, itemCount: items.length, completedAt: Timestamp.now() });
    return Response.json({ documentId, itemCount: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "드라마 목록 생성에 실패했습니다.";
    await history.update({ status: "failed", error: message, completedAt: Timestamp.now() });
    return Response.json({ error: message }, { status: 500 });
  }
};
