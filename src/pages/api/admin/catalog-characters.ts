import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
} from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { createHistory } from "../../../services/dramaCatalogStore";
import { fetchCatalogDetail } from "../../../utils/tvhotBroadcastCatalog";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json().catch(() => ({}));
    const categoryKey = String(body.category || "");
    const category = getCatalogCategory(categoryKey);
    if (!category) throw new Error("지원하지 않는 카테고리입니다.");
    const current = await db
      .collection(`${category.collection}CatalogMeta`)
      .doc("current")
      .get();
    const documentId = String(
      body.documentId || current.data()?.documentId || "",
    );
    if (!documentId) throw new Error(`${category.title} 생성 문서가 없습니다.`);
    const collection = db
      .collection(category.collection)
      .doc(documentId)
      .collection("items");
    const itemId = String(body.itemId || "");
    const documents = itemId
      ? [await collection.doc(itemId).get()]
      : (await collection.orderBy("globalOrder").get()).docs;
    const targets = documents.filter((document) => document.exists).filter((document) => {
      const characters = document.data()?.characters;
      return !Array.isArray(characters) || characters.length === 0;
    });
    const settings = await db
      .collection("crawlerSettings")
      .doc("sources")
      .get();
    const sourceUrl = String(settings.data()?.[category.sourceKey] || "");
    if (!sourceUrl)
      throw new Error(`${category.title} 크롤링 주소가 없습니다.`);
    let updated = 0;
    const failures: Array<{ id: string; title: string; error: string }> = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const document = targets[cursor++];
        const item = document.data();
        const history = await createHistory("detail", {
          category: categoryKey,
          documentId,
          itemId: document.id,
          title: item.title,
        });
        try {
          const detail = await fetchCatalogDetail(
            String(item.detailKey || ""),
            sourceUrl,
          );
          const characters = detail.cast.map((person) => ({
            name: "",
            actor: person.name,
            imageUrl: person.imageUrl,
          }));
          await document.ref.set(
            {
              ...detail,
              characters,
              detailCrawledAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            },
            { merge: true },
          );
          await history.update({
            status: "success",
            characterCount: characters.length,
            completedAt: Timestamp.now(),
          });
          updated += 1;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "상세정보 수집에 실패했습니다.";
          failures.push({
            id: document.id,
            title: String(item.title || ""),
            error: message,
          });
          await history.update({
            status: "failed",
            error: message,
            completedAt: Timestamp.now(),
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, targets.length) }, () => worker()),
    );
    return Response.json({
      category: categoryKey,
      documentId,
      targetCount: targets.length,
      updated,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "등장인물 업데이트에 실패했습니다.",
      },
      { status: 502 },
    );
  }
};
