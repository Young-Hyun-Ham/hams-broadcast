import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { createHistory, itemDocumentId } from "../../../services/dramaCatalogStore";
import { fetchCatalogFromUrl, fetchCatalogPageCount, type CatalogBroadcast } from "../../../utils/tvhotBroadcastCatalog";

export const prerender = false;

function koreaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  const body = await request.json().catch(() => ({}));
  const categoryKey = String(body.category || "");
  const category = getCatalogCategory(categoryKey);
  if (!category) return Response.json({ error: "지원하지 않는 카테고리입니다." }, { status: 400 });
  const history = await createHistory("catalog", { category: categoryKey, collection: category.collection });
  try {
    const settings = await db.collection("crawlerSettings").doc("sources").get();
    const sourceUrl = String(settings.data()?.[category.sourceKey] || "").trim();
    if (!sourceUrl) throw new Error(`대시보드에 ${category.title} 크롤링 주소를 먼저 저장해 주세요.`);
    const totalPages = Math.min(500, await fetchCatalogPageCount(sourceUrl));
    const pageResults: CatalogBroadcast[][] = new Array(totalPages);let cursor=0;
    const failedPages:Array<{page:number;error:string}>=[];
    const worker=async()=>{while(cursor<totalPages){const page=cursor+++1;let lastError:unknown;for(let attempt=1;attempt<=3;attempt++){try{pageResults[page-1]=await fetchCatalogFromUrl(page,sourceUrl);lastError=undefined;break;}catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*500));}}if(lastError)failedPages.push({page,error:lastError instanceof Error?lastError.message:String(lastError)});}};
    await Promise.all(Array.from({length:Math.min(5,totalPages)},()=>worker()));
    const collectedKeys=new Set<string>();const collected:Array<CatalogBroadcast & {sourcePage:number;sourceOrder:number;globalOrder:number}>=[];
    pageResults.forEach((items,pageIndex)=>items.forEach((item,index)=>{if(!collectedKeys.has(item.detailKey)){collectedKeys.add(item.detailKey);collected.push({...item,sourcePage:pageIndex+1,sourceOrder:index+1,globalOrder:collected.length+1});}}));
    const crawledPages=totalPages;
    if (!collected.length) throw new Error("수집된 데이터가 없습니다.");
    const date = koreaDate();
    const meta = db.collection(`${category.collection}CatalogMeta`);
    const counterRef = meta.doc("generation-counter");
    const documentId = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const sequence = snapshot.data()?.date === date ? Number(snapshot.data()?.sequence || 0) + 1 : 1;
      transaction.set(counterRef, { date, sequence, updatedAt: Timestamp.now() });
      return `${date}-${String(sequence).padStart(3, "0")}`;
    });
    const parent = db.collection(category.collection).doc(documentId);
    await parent.set({ category: categoryKey, itemCount: collected.length, status: "processing", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    for (let start = 0; start < collected.length; start += 400) {
      const batch = db.batch();
      collected.slice(start, start + 400).forEach((item) => batch.set(parent.collection("items").doc(itemDocumentId(item)), { ...item, updatedAt: Timestamp.now() }));
      await batch.commit();
    }
    await Promise.all([parent.update({ status: "ready", updatedAt: Timestamp.now() }), meta.doc("current").set({ documentId, itemCount: collected.length, updatedAt: Timestamp.now() })]);
    failedPages.sort((a,b)=>a.page-b.page);
    await history.update({ status: "success", documentId, itemCount: collected.length, crawledPages, successfulPages:totalPages-failedPages.length, failedPages, completedAt: Timestamp.now() });
    return Response.json({ category: categoryKey, collection: category.collection, documentId, itemCount: collected.length, crawledPages, successfulPages:totalPages-failedPages.length, failedPages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수동 생성에 실패했습니다.";
    await history.update({ status: "failed", error: message, completedAt: Timestamp.now() });
    return Response.json({ error: message }, { status: 500 });
  }
};
