import type { APIRoute } from "astro";
import { getAppBaseUrl, getSsoClientId, getSsoServerUrl } from "@hams-fam/sso-client/core";
import { configureSsoEnvironment } from "../../../lib/ssoEnv";

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  configureSsoEnvironment();
  const requestUrl = new URL(request.url);
  const destination = requestUrl.searchParams.get("destination") === "services" ? "/profile/services" : "/profile";
  const profileUrl = new URL(destination, getSsoServerUrl());
  profileUrl.searchParams.set("client_id", getSsoClientId());
  const serviceLoginUrl = new URL("/api/sso/login", getAppBaseUrl());
  serviceLoginUrl.searchParams.set("returnTo", "/");
  profileUrl.searchParams.set("return_to", serviceLoginUrl.toString());
  return Response.redirect(profileUrl);
};
