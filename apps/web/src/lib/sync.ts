"use client";
import { useSyncExternalStore } from "react";
import { ApiError, api, type User } from "./auth";
import { clearLocalProgress, getProgress, onLocalChange, replaceProgress, sanitize, type Progress } from "./progress";

/**
 * Sync model (see docs/LEARNING.md, Phase 5):
 *  - Local storage stays the source the UI reads, so the app works offline and instantly.
 *  - On sign-in or page load the local document is merged into the account (monotonic, idempotent), and the
 *    merged result replaces the local copy.
 *  - After that, local changes are pushed (debounced). Failures retry with backoff; the UI says so.
 */
export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error";
let status: SyncStatus = "off";
let lastSyncedAt: number | null = null;
const listeners = new Set<() => void>();
const snap = () => `${status}|${lastSyncedAt ?? ""}`;
const emit = () => listeners.forEach((l) => l());
function setStatus(s: SyncStatus) { status = s; if (s === "synced") lastSyncedAt = Date.now(); emit(); }
export function useSync() {
  const key = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, snap, () => "off|");
  const [s, t] = key.split("|");
  return { status: s as SyncStatus, lastSyncedAt: t ? Number(t) : null };
}

const FLAG = "nexora-sync-user-v1";
const getFlag = () => { try { return localStorage.getItem(FLAG); } catch { return null; } };
const setFlag = (v: string | null) => { try { v ? localStorage.setItem(FLAG, v) : localStorage.removeItem(FLAG); } catch { /* storage unavailable */ } };

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
let activeUser: string | null = null;
let stopListening: (() => void) | null = null;

const fail = (e: unknown) => setStatus(e instanceof ApiError && e.status === 0 ? "offline" : "error");

async function pullAndMerge(user: User) {
  setStatus("syncing");
  let mode: "union" | "keep" = "keep";
  if (getFlag() !== user.id) {
    // Local data from a different account must never flow into this one.
    if (getFlag()) clearLocalProgress();
    mode = "union"; // first sign-in on this browser: bring the anonymous progress along
  }
  const res = await api<{ progress: Progress }>("/api/progress/merge", { method: "POST", body: { progress: getProgress(), knownMode: mode } });
  replaceProgress(sanitize(res.progress));
  setFlag(user.id);
  setStatus("synced");
}

function schedulePush(delay = 1200) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (!activeUser) return;
    setStatus("syncing");
    try {
      await api("/api/progress/merge", { method: "POST", body: { progress: getProgress(), knownMode: "replace" } });
      attempt = 0; setStatus("synced");
    } catch (e) {
      fail(e);
      if (e instanceof ApiError && e.status === 401) return; // signed out elsewhere; the auth refresh will handle it
      attempt = Math.min(attempt + 1, 6);
      schedulePush(Math.min(30_000, 2000 * 2 ** attempt));
    }
  }, delay);
}

/** Called by SyncAgent whenever the signed-in user changes. */
export async function startSync(user: User | null) {
  if (user?.id === activeUser) return;
  stopListening?.(); stopListening = null; clearTimeout(pushTimer);
  activeUser = user?.id ?? null;
  if (!user) { setStatus("off"); return; }
  try { await pullAndMerge(user); } catch (e) { fail(e); if (activeUser === user.id) schedulePush(5000); }
  if (activeUser !== user.id) return;
  stopListening = onLocalChange(() => schedulePush());
}

/** Sign out: tell the server, then clear this browser so the next person on it starts clean. */
export async function signOut() {
  try { await api("/api/auth/logout", { method: "POST" }); } finally { endLocalSession(); }
}
export async function signOutEverywhere() {
  await api("/api/auth/logout-all", { method: "POST" });
  endLocalSession();
}
export async function deleteAccount() {
  await api("/api/auth/account", { method: "DELETE" });
  endLocalSession();
}
function endLocalSession() {
  stopListening?.(); stopListening = null; clearTimeout(pushTimer); activeUser = null;
  clearLocalProgress(); setFlag(null); setStatus("off");
  import("./auth").then((m) => m.markSignedOut());
}
