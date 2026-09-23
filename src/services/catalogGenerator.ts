import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory, type CatalogCategory } from "../config/catalogCategories";
import { db } from "../lib/firebaseAdmin";
import { createHistory, itemDocumentId, normalizedCatalogTitle } from "./dramaCatalogStore";
import { fetchCatalogFromUrl, fetchCatalogPageCount, type CatalogBroadcast } from "../utils/crawlers";

type StoredItem = CatalogBroadcast & { sourcePage: number; sourceOrder: number; globalOrder: number };
type FailureDetail = { stage: "crawl" | "write" | "finalize"; page?: number; itemId?: string; code?: string | number; message: string };
const MAX_FAILURE_DETAILS = 500;

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function historyFailures(failures: FailureDetail[]) {
  return { failures: failures.slice(0, MAX_FAILURE_DETAILS), failureDetailsTruncated: Math.max(0, failures.length - MAX_FAILURE_DETAILS) };
}

function catalogFields(item: StoredItem, category: CatalogCategory) {
  return { category, detailKey: item.detailKey, title: item.title, thumbnailUrl: item.thumbnailUrl,
    genres: item.genres, rating: item.rating, isUpdated: item.isUpdated };
}

function sameCatalogFields(current: FirebaseFirestore.DocumentData | undefined, next: ReturnType<typeof catalogFields>) {
  if (!current) return false;
  return current.category === next.category && current.detailKey === next.detailKey && current.title === next.title
    && current.thumbnailUrl === next.thumbnailUrl && current.rating === next.rating && current.isUpdated === next.isUpdated
    && JSON.stringify(current.genres || []) === JSON.stringify(next.genres);
}

async function getAllInChunks(references: FirebaseFirestore.DocumentReference[]) {
  const snapshots: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let start = 0; start < references.length; start += 300) {
    snapshots.push(...await db.getAll(...references.slice(start, start + 300)));
  }
  return snapshots;
}

export async function generateCatalog(categoryKey: CatalogCategory) {
  const category = getCatalogCategory(categoryKey);
  if (!category) throw new Error("지원하지 않는 카테고리입니다.");
  const history = await createHistory("catalog", { operation: "manual-generation", category: categoryKey,
    collection: "catalogItems", totalCount: 0, successCount: 0, failureCount: 0, failures: [] }).catch(() => null);
  const runId = history?.id || db.collection("catalogHistory").doc().id;
  const failures: FailureDetail[] = [];

  try {
    const settings = await db.collection("crawlerSettings").doc("sources").get();
    const sourceUrl = String(settings.data()?.[category.sourceKey] || "").trim();
    if (!sourceUrl) throw new Error(`대시보드에 ${category.title} 크롤링 주소를 먼저 저장해 주세요.`);

    const totalPages = Math.min(500, await fetchCatalogPageCount(sourceUrl));
    const pageResults: CatalogBroadcast[][] = new Array(totalPages);
    let cursor = 0;
    const worker = async () => {
      while (cursor < totalPages) {
        const page = cursor++ + 1;
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            pageResults[page - 1] = await fetchCatalogFromUrl(page, sourceUrl);
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          }
        }
        if (lastError) failures.push({ stage: "crawl", page, message: errorMessage(lastError) });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, totalPages) }, () => worker()));

    const keys = new Set<string>();
    const collected: StoredItem[] = [];
    pageResults.forEach((items, pageIndex) => items?.forEach((item, index) => {
      const identity = normalizedCatalogTitle(item.title);
      if (keys.has(identity)) return;
      keys.add(identity);
      collected.push({ ...item, sourcePage: pageIndex + 1, sourceOrder: index + 1, globalOrder: collected.length + 1 });
    }));
    if (!collected.length) throw new Error("수집된 데이터가 없습니다.");
    await history?.update({ totalCount: collected.length, totalPages, crawledPages: totalPages - failures.length }).catch(() => undefined);

    const stateRef = db.collection("catalogState").doc(categoryKey);
    const existingState = await stateRef.collection("items").get();
    const existingStateById = new Map(existingState.docs.map((document) => [document.id, document.data()]));
    const itemReferences = collected.map((item) => db.collection("catalogItems").doc(itemDocumentId(item, categoryKey)));
    const existingItems = await getAllInChunks(itemReferences);
    const existingItemsById = new Map(existingItems.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data()]));
    const nextIds = new Set(itemReferences.map((reference) => reference.id));
    const writer = db.bulkWriter();
    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let stateWriteCount = 0;
    let deactivatedCount = 0;

    writer.onWriteError((error) => {
      const retry = Number(error.code) !== 8 && error.failedAttempts < 3;
      if (!retry) failures.push({ stage: "write", itemId: error.documentRef.id, code: error.code, message: errorMessage(error) });
      return retry;
    });

    for (let index = 0; index < collected.length; index++) {
      const item = collected[index];
      const itemRef = itemReferences[index];
      const fields = catalogFields(item, categoryKey);
      const existingItem = existingItemsById.get(itemRef.id);
      if (!existingItem) {
        writer.set(itemRef, { ...fields, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        insertedCount += 1;
      } else if (!sameCatalogFields(existingItem, fields)) {
        writer.set(itemRef, { ...fields, updatedAt: Timestamp.now() }, { merge: true });
        updatedCount += 1;
      } else unchangedCount += 1;

      const stateFields = { order: item.globalOrder, sourcePage: item.sourcePage, sourceOrder: item.sourceOrder, itemRef };
      const oldState = existingStateById.get(itemRef.id);
      if (!oldState || oldState.order !== stateFields.order || oldState.sourcePage !== stateFields.sourcePage
        || oldState.sourceOrder !== stateFields.sourceOrder || oldState.itemRef?.path !== itemRef.path) {
        writer.set(stateRef.collection("items").doc(itemRef.id), stateFields);
        stateWriteCount += 1;
      }
    }
    for (const document of existingState.docs) {
      if (!nextIds.has(document.id)) {
        writer.delete(document.ref);
        deactivatedCount += 1;
      }
    }
    await writer.close();

    const failureCount = failures.filter((failure) => failure.stage === "write").length;
    const successCount = collected.length - failureCount;
    const status = failureCount || failures.some((failure) => failure.stage === "crawl") ? "ready_with_errors" : "ready";
    await stateRef.set({ category: categoryKey, itemCount: successCount, lastSuccessfulRunId: runId, status,
      sourceUrl, totalPages, updatedAt: Timestamp.now(), lastCrawledAt: Timestamp.now() }, { merge: true });

    const historyStatus = failureCount || failures.length ? "success_with_errors" : "success";
    await history?.update({ status: historyStatus, documentId: runId, totalCount: collected.length, successCount, failureCount,
      insertedCount, updatedCount, unchangedCount, stateWriteCount, deactivatedCount,
      crawlFailureCount: failures.filter((failure) => failure.stage === "crawl").length,
      ...historyFailures(failures), completedAt: Timestamp.now() }).catch(() => undefined);
    return { category: categoryKey, collection: "catalogItems", documentId: runId, itemCount: successCount,
      totalCount: collected.length, successCount, failureCount, insertedCount, updatedCount, unchangedCount,
      stateWriteCount, deactivatedCount, failures, crawledPages: totalPages,
      successfulPages: totalPages - failures.filter((failure) => failure.stage === "crawl").length };
  } catch (error) {
    const message = errorMessage(error);
    failures.push({ stage: "finalize", message });
    await history?.update({ status: "failed", documentId: runId, error: message,
      ...historyFailures(failures), completedAt: Timestamp.now() }).catch(() => undefined);
    throw Object.assign(new Error(message), { documentId: runId });
  }
}
