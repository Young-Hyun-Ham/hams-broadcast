export function configureSsoEnvironment() {
  process.env.NEXT_PUBLIC_APP_URL ||= import.meta.env.NEXT_PUBLIC_APP_URL;
  process.env.HAMS_OAUTH_SERVER_URL ||= import.meta.env.HAMS_OAUTH_SERVER_URL;
  process.env.HAMS_OAUTH_CLIENT_ID ||= import.meta.env.HAMS_OAUTH_CLIENT_ID;
  process.env.HAMS_OAUTH_CLIENT_SECRET ||= import.meta.env.HAMS_OAUTH_CLIENT_SECRET;
  process.env.HAMS_COOKIE_PREFIX ||= import.meta.env.HAMS_COOKIE_PREFIX;
  process.env.HAMS_SESSION_SECRET ||= import.meta.env.HAMS_SESSION_SECRET;
  process.env.HAMS_SSO_SESSION_MAX_AGE_SEC ||= import.meta.env.HAMS_SSO_SESSION_MAX_AGE_SEC;
  process.env.NEXT_PUBLIC_DEV_MOCK_LOGIN ||= import.meta.env.NEXT_PUBLIC_DEV_MOCK_LOGIN;
  process.env.HAMS_SSO_DEV_MOCK_USER_ID ||= import.meta.env.HAMS_SSO_DEV_MOCK_USER_ID;
  process.env.HAMS_SSO_DEV_MOCK_USER_EMAIL ||= import.meta.env.HAMS_SSO_DEV_MOCK_USER_EMAIL;
  process.env.HAMS_SSO_DEV_MOCK_USER_LOGIN_ID ||= import.meta.env.HAMS_SSO_DEV_MOCK_USER_LOGIN_ID;
  process.env.HAMS_SSO_DEV_MOCK_USER_NAME ||= import.meta.env.HAMS_SSO_DEV_MOCK_USER_NAME;
}
