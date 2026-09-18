import { getSsoUserFromRequest } from "@hams-fam/sso-client/core";
import { configureSsoEnvironment } from "./ssoEnv";

function adminEmails() {
  const raw = String(import.meta.env.HAMS_ADMIN_ACCOUNT || process.env.HAMS_ADMIN_ACCOUNT || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((value) => value.trim().toLowerCase()).filter(Boolean);
  } catch {
    // 쉼표 구분 및 작은따옴표 배열 표기도 지원합니다.
  }
  return raw.replace(/^\[|\]$/g, "").split(",").map((value) => value.trim().replace(/^['"]|['"]$/g, "").toLowerCase()).filter(Boolean);
}

export function getSessionUser(request: Request) {
  configureSsoEnvironment();
  return getSsoUserFromRequest(request);
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && adminEmails().includes(email.trim().toLowerCase()));
}

export function isAdminRequest(request: Request) {
  return isAdminEmail(getSessionUser(request)?.email);
}

export function adminUnauthorizedResponse() {
  return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
}
