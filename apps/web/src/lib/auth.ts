"use client";
import { useSyncExternalStore } from "react";

export interface User { id: string; email: string; displayName: string | null; emailVerified: boolean; hasPassword: boolean }
/** loading: not asked yet · anonymous: asked, no session · authed · unavailable: the account service did not answer */
export interface AuthState { status: "loading" | "anonymous" | "authed" | "unavailable"; user: User | null; oauth: string[] }

let state: AuthState = { status: "loading", user: null, oauth: [] };
const SERVER: AuthState = { status: "loading", user: null, oauth: [] };
const listeners = new Set<() => void>();
const set = (next: AuthState) => { state = next; listeners.forEach((l) => l()); };

export const useAuth = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => SERVER);
export const getAuth = () => state;

export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

/** Same-origin call; the browser attaches the session cookie and Origin header. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch { throw new ApiError(0, "network", "Could not reach the account service."); }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON (e.g. a proxy error page) */ }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? (res.status >= 500 ? "The account service is unavailable." : "Request failed."));
  }
  return data as T;
}

export async function refreshAuth(): Promise<AuthState> {
  try {
    const [me, prov] = await Promise.all([
      api<{ user: User | null }>("/api/auth/me"),
      api<{ oauth: string[] }>("/api/auth/providers").catch(() => ({ oauth: [] as string[] })),
    ]);
    set({ status: me.user ? "authed" : "anonymous", user: me.user, oauth: prov.oauth });
  } catch {
    // A failed check is not a sign-out: keep a known user rather than flicker the UI during a network blip.
    set(state.user ? state : { status: "unavailable", user: null, oauth: [] });
  }
  return state;
}

export async function signIn(email: string, password: string) {
  const r = await api<{ user: User }>("/api/auth/login", { method: "POST", body: { email, password } });
  set({ ...state, status: "authed", user: r.user });
}
export async function signUp(email: string, password: string, displayName?: string) {
  const r = await api<{ user: User }>("/api/auth/register", { method: "POST", body: { email, password, ...(displayName ? { displayName } : {}) } });
  set({ ...state, status: "authed", user: r.user });
}
export const requestPasswordReset = (email: string) => api<{ ok: true }>("/api/auth/password/forgot", { method: "POST", body: { email } });
export const resetPassword = (token: string, password: string) => api<{ ok: true }>("/api/auth/password/reset", { method: "POST", body: { token, password } });
export function markSignedOut() { set({ ...state, status: "anonymous", user: null }); }
