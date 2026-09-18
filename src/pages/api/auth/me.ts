import type { APIRoute } from "astro";
import { getSessionUser, isAdminEmail } from "../../../lib/adminAuth";

export const prerender = false;
export const GET: APIRoute = ({ request }) => {
  const user = getSessionUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ user, isAdmin: isAdminEmail(user.email) });
};
