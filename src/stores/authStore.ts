import { createStore } from "zustand/vanilla";

export type SessionUser = {
  id?: string;
  email?: string;
  loginId?: string;
  nickname?: string;
  birthDate?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  serviceMemberships?: Array<{ serviceName?: string; plan?: string }>;
};

type AuthStatus = "idle" | "loading" | "authenticated" | "guest" | "error";

type AuthState = {
  user: SessionUser | null;
  isAdmin: boolean;
  status: AuthStatus;
  error: string | null;
};

const initialState: AuthState = {
  user: null,
  isAdmin: false,
  status: "idle",
  error: null,
};

export const authStore = createStore<AuthState>()(() => initialState);

let pendingRequest: Promise<void> | null = null;

export function loadAuth(force = false) {
  const state = authStore.getState();
  if (!force && (state.status === "authenticated" || state.status === "guest")) return Promise.resolve();
  if (!force && pendingRequest) return pendingRequest;

  authStore.setState({ status: "loading", error: null });
  pendingRequest = fetch("/api/auth/me", { credentials: "same-origin" })
    .then(async (response) => {
      if (response.status === 401) {
        authStore.setState({ user: null, isAdmin: false, status: "guest", error: null });
        return;
      }
      if (!response.ok) throw new Error("사용자 정보를 불러오지 못했습니다.");
      const data = await response.json() as { user: SessionUser; isAdmin?: boolean };
      authStore.setState({ user: data.user, isAdmin: Boolean(data.isAdmin), status: "authenticated", error: null });
    })
    .catch((error: unknown) => {
      authStore.setState({ user: null, isAdmin: false, status: "error", error: error instanceof Error ? error.message : "사용자 정보를 불러오지 못했습니다." });
    })
    .finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export function resetAuth() {
  authStore.setState(initialState);
}
