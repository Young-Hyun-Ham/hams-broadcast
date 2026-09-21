import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory, type CatalogCategory } from "../config/catalogCategories";
import { db } from "../lib/firebaseAdmin";
import { createHistory, itemDocumentId } from "./dramaCatalogStore";
import { fetchCatalogFromUrl, fetchCatalogPageCount, type CatalogBroadcast } from "../utils/tvhotBroadcastCatalog";

type StoredItem = CatalogBroadcast & { sourcePage: number; sourceOrder: number; globalOrder: number };
type FailureDetail = {
  stage: "crawl" | "write" | "finalize";
  page?: number;
  itemId?: string;
  title?: string;
  globalOrder?: number;
  code?: string | number;
  message: string;
};

const MAX_FAILURE_DETAILS = 500;

function koreaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function historyFailures(failures: FailureDetail[]) {
  return {
    failures: failures.slice(0, MAX_FAILURE_DETAILS),
    failureDetailsTruncated: Math.max(0, failures.length - MAX_FAILURE_DETAILS),
  };
}

export async function generateCatalog(categoryKey: CatalogCategory) {
  const category = getCatalogCategory(categoryKey);
  if (!category) throw new Error("지원하지 않는 카테고리입니다.");

  const history = await createHistory("catalog", {
    operation: "manual-generation",
    category: categoryKey,
    collection: category.collection,
    totalCount: 0,
    successCount: 0,
    failureCount: 0,
    failures: [],
  }).catch(() => null);
  const failures: FailureDetail[] = [];
  let parent: FirebaseFirestore.DocumentReference | null = null;
  let documentId = "";

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
      if (keys.has(item.detailKey)) return;
      keys.add(item.detailKey);
      collected.push({ ...item, sourcePage: pageIndex + 1, sourceOrder: index + 1, globalOrder: collected.length + 1 });
    }));
    if (!collected.length) throw new Error("수집된 데이터가 없습니다.");
    await history?.update({ totalCount: collected.length, totalPages, crawledPages: totalPages - failures.length }).catch(() => undefined);

    const date = koreaDate();
    const meta = db.collection(`${category.collection}CatalogMeta`);
    const counterRef = meta.doc("generation-counter");
    const pendingRef = meta.doc("pending");
    const [pendingSnapshot, counterSnapshot] = await Promise.all([pendingRef.get(), counterRef.get()]);
    const counter = counterSnapshot.data();
    const latestId = counter?.date && counter?.sequence ? `${counter.date}-${String(counter.sequence).padStart(3, "0")}` : "";
    const resumeId = String(pendingSnapshot.data()?.documentId || latestId);
    if (resumeId) {
      const candidate = await db.collection(category.collection).doc(resumeId).get();
      if (candidate.exists && candidate.data()?.category === categoryKey && candidate.data()?.status !== "ready") documentId = resumeId;
    }
    if (!documentId) {
      documentId = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(counterRef);
        const sequence = snapshot.data()?.date === date ? Number(snapshot.data()?.sequence || 0) + 1 : 1;
        transaction.set(counterRef, { date, sequence, updatedAt: Timestamp.now() });
        return `${date}-${String(sequence).padStart(3, "0")}`;
      });
    }

    parent = db.collection(category.collection).doc(documentId);
    const [parentSnapshot, existingSnapshot] = await Promise.all([parent.get(), parent.collection("items").select().get()]);
    const existingIds = new Set(existingSnapshot.docs.map((document) => document.id));
    await Promise.all([
      parent.set({
        category: categoryKey, totalCount: collected.length, itemCount: existingIds.size,
        status: "processing", ...(parentSnapshot.exists ? {} : { createdAt: Timestamp.now() }), updatedAt: Timestamp.now(),
      }, { merge: true }),
      pendingRef.set({ documentId, category: categoryKey, totalCount: collected.length, successCount: existingIds.size, updatedAt: Timestamp.now() }),
      history?.update({ documentId, resumedCount: existingIds.size }),
    ].filter(Boolean) as Promise<unknown>[]);

    const itemByPath = new Map<string, { itemId: string; item: StoredItem }>();
    const writer = db.bulkWriter();
    writer.onWriteError((error) => {
      const retry = Number(error.code) !== 8 && error.failedAttempts < 3;
      if (!retry) {
        const target = itemByPath.get(error.documentRef.path);
        failures.push({
          stage: "write", itemId: target?.itemId, title: target?.item.title,
          globalOrder: target?.item.globalOrder, code: error.code, message: errorMessage(error),
        });
      }
      return retry;
    });

    const writes: Promise<unknown>[] = [];
    for (const item of collected) {
      const itemId = itemDocumentId(item);
      if (existingIds.has(itemId)) continue;
      const ref = parent.collection("items").doc(itemId);
      itemByPath.set(ref.path, { itemId, item });
      writes.push(writer.set(ref, { ...item, updatedAt: Timestamp.now() }).catch(() => undefined));
    }
    await writer.close();
    await Promise.all(writes);

    const finalSnapshot = await parent.collection("items").select().get();
    const finalIds = new Set(finalSnapshot.docs.map((document) => document.id));
    const successCount = collected.reduce((count, item) => count + (finalIds.has(itemDocumentId(item)) ? 1 : 0), 0);
    const failureCount = collected.length - successCount;
    const status = failureCount || failures.some((failure) => failure.stage === "crawl") ? "ready_with_errors" : "ready";

    const finalize = db.batch();
    finalize.set(parent, {
      status, totalCount: collected.length, itemCount: successCount, successCount, failureCount,
      failures: failures.filter((failure) => failure.stage === "write").slice(0, MAX_FAILURE_DETAILS),
      updatedAt: Timestamp.now(), completedAt: Timestamp.now(),
    }, { merge: true });
    finalize.set(meta.doc("current"), { documentId, itemCount: successCount, updatedAt: Timestamp.now() });
    finalize.delete(pendingRef);
    await finalize.commit();

    const historyStatus = failureCount || failures.length ? "success_with_errors" : "success";
    await history?.update({
      status: historyStatus, documentId, totalCount: collected.length, successCount, failureCount,
      crawlFailureCount: failures.filter((failure) => failure.stage === "crawl").length,
      ...historyFailures(failures), completedAt: Timestamp.now(),
    }).catch(() => undefined);
    return {
      category: categoryKey, collection: category.collection, documentId, itemCount: successCount,
      totalCount: collected.length, successCount, failureCount, failures,
      crawledPages: totalPages, successfulPages: totalPages - failures.filter((failure) => failure.stage === "crawl").length,
    };
  } catch (error) {
    const message = errorMessage(error);
    failures.push({ stage: "finalize", message });
    const updates: Promise<unknown>[] = [];
    if (parent) updates.push(parent.set({ status: "failed", error: message, updatedAt: Timestamp.now() }, { merge: true }));
    if (history) updates.push(history.update({
      status: "failed", documentId: documentId || null, error: message,
      ...historyFailures(failures), completedAt: Timestamp.now(),
    }));
    await Promise.allSettled(updates);
    throw Object.assign(new Error(message), { documentId });
  }
}
