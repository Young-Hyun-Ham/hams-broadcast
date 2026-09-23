import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
} from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { createHistory } from "../../../services/dramaCatalogStore";
import { fetchCatalogDetail } from "../../../utils/crawlers";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    const body = await request.json().catch(() => ({}));
    const categoryKey = String(body.category || "");
    const category = getCatalogCategory(categoryKey);
    if (!category) throw new Error("지원하지 않는 카테고리입니다.");
    const state = await db.collection("catalogState").doc(categoryKey).get();
    if (!state.exists) throw new Error(`${category.title} 생성 데이터가 없습니다.`);
    const documentId = String(state.data()?.lastSuccessfulRunId || categoryKey);
    const itemId = String(body.itemId || "");
    let documents: FirebaseFirestore.DocumentSnapshot[];
    if (itemId) {
      documents = [await db.collection("catalogItems").doc(itemId).get()];
    } else {
      const stateItems = await state.ref.collection("items").orderBy("order").get();
      documents = [];
      for (let start = 0; start < stateItems.docs.length; start += 300) {
        const references = stateItems.docs.slice(start, start + 300)
          .map((document) => db.collection("catalogItems").doc(document.id));
        if (references.length) documents.push(...await db.getAll(...references));
      }
    }
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
