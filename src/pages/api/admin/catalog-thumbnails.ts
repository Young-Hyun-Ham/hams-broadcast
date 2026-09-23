import type { APIRoute } from "astro";
import { Timestamp } from "firebase-admin/firestore";
import { getCatalogCategory } from "../../../config/catalogCategories";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
} from "../../../lib/adminAuth";
import { db } from "../../../lib/firebaseAdmin";
import { archiveCatalogThumbnails } from "../../../services/broadcastThumbnailArchive";
import { createHistory } from "../../../services/dramaCatalogStore";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  const body = await request.json().catch(() => ({}));
  const categoryKey = String(body.category || "");
  const category = getCatalogCategory(categoryKey);
  if (!category)
    return Response.json(
      { error: "지원하지 않는 카테고리입니다." },
      { status: 400 },
    );
  const history = await createHistory("thumbnail", {
    category: categoryKey,
    collection: category.collection,
  });
  try {
    const current = await db
      .collection("catalogState")
      .doc(categoryKey)
      .get();
    const documentId = String(current.data()?.lastSuccessfulRunId || categoryKey);
    if (!current.exists) throw new Error(`${category.title} 생성 문서가 없습니다.`);
    const result = await archiveCatalogThumbnails(categoryKey);
    await history.update({
      status: "success",
      documentId,
      ...result,
      completedAt: Timestamp.now(),
    });
    return Response.json({ category: categoryKey, documentId, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "썸네일 저장에 실패했습니다.";
    await history.update({
      status: "failed",
      error: message,
      completedAt: Timestamp.now(),
    });
    return Response.json({ error: message }, { status: 500 });
  }
};
