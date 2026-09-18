import type { APIRoute } from "astro";
import { handleSsoLogin } from "@hams-fam/sso-client/web";
import { configureSsoEnvironment } from "../../../lib/ssoEnv";

export const prerender = false;
export const GET: APIRoute = ({ request }) => {
  configureSsoEnvironment();
  return handleSsoLogin(request);
};
