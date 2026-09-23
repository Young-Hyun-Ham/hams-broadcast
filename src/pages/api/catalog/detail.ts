import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import { db } from "../../../lib/firebaseAdmin";
import { createBroadcastHistory } from "../../../services/broadcastCatalogHistory";
import { fetchCatalogDetail } from "../../../utils/crawlers";

export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const categoryKey = String(url.searchParams.get("category") || "drama");
  const documentId = String(url.searchParams.get("documentId") || "");
  const itemId = String(url.searchParams.get("itemId") || "");
  const category = getCatalogCategory(categoryKey);
  if (!category)
    return Response.json(
      { error: "지원하지 않는 카테고리입니다." },
      { status: 400 },
    );
  try {
    const ref = documentId === categoryKey
      ? db.collection("catalogItems").doc(itemId)
      : db.collection(category.collection).doc(documentId).collection("items").doc(itemId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("작품 정보를 찾을 수 없습니다.");
    const item = snapshot.data()!;
    const stored = {
      synopsis: String(item.synopsis || ""),
      posterUrl: String(item.posterUrl || item.thumbnailUrl || ""),
      genres: Array.isArray(item.genres) ? item.genres : [],
      information:
        item.information && typeof item.information === "object"
          ? item.information
          : {},
      cast: Array.isArray(item.cast) ? item.cast : [],
      characters: Array.isArray(item.characters) ? item.characters : [],
    };
    if (stored.characters.length)
      return Response.json({ ...stored, source: "database" });
    const history = await createBroadcastHistory("detail", {
      category: categoryKey,
      documentId,
      itemId,
      title: item.title,
    });
    try {
      const settings = await db
        .collection("crawlerSettings")
        .doc("sources")
        .get();
      const sourceUrl = String(settings.data()?.[category.sourceKey] || "");
      if (!sourceUrl)
        throw new Error(`${category.title} 크롤링 주소가 없습니다.`);
      const detail = await fetchCatalogDetail(
        String(item.detailKey || ""),
        sourceUrl,
      );
      const characters = detail.cast.map((person) => ({
        name: "",
        actor: person.name,
        imageUrl: person.imageUrl,
      }));
      await ref.set(
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
      return Response.json({ ...detail, characters, source: "crawler" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "상세정보 수집에 실패했습니다.";
      await history.update({
        status: "failed",
        error: message,
        completedAt: Timestamp.now(),
      });
      throw error;
    }
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "상세정보를 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }
};
