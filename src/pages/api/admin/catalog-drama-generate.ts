import type { APIRoute } from "astro";
import { adminUnauthorizedResponse, isAdminRequest } from "../../../lib/adminAuth";
import { generateCatalog } from "../../../services/catalogGenerator";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    return Response.json(await generateCatalog("drama"));
  } catch (error) {
    const value = error as Error & { documentId?: string };
    return Response.json({ error: value.message || "드라마 목록 생성에 실패했습니다.", documentId: value.documentId || undefined }, { status: 500 });
  }
};
