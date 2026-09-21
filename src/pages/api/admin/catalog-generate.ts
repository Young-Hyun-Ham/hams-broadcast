import type { APIRoute } from "astro";
import { getCatalogCategory, type CatalogCategory } from "../../../config/catalogCategories";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { generateCatalog } from "../../../services/catalogGenerator";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  const body = await request.json().catch(() => ({}));
  const categoryKey = String(body.category || "");
  if (!getCatalogCategory(categoryKey)) return Response.json({ error: "지원하지 않는 카테고리입니다." }, { status: 400 });
  try {
    return Response.json(await generateCatalog(categoryKey as CatalogCategory));
  } catch (error) {
    const value = error as Error & { documentId?: string };
    return Response.json({ error: value.message || "수동 생성에 실패했습니다.", documentId: value.documentId || undefined }, { status: 500 });
  }
};
