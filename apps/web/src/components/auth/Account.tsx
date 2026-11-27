"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, useAuth } from "@/lib/auth";
import { deleteAccount, signOut, signOutEverywhere, useSync } from "@/lib/sync";

interface SessionRow { id: string; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null; current: boolean }
const card = "rounded-2xl border border-line bg-surface p-6";
const btn = "inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm transition hover:border-ink disabled:opacity-50";
const SYNC_COPY = { off: "Not syncing", syncing: "Syncing…", synced: "Up to date.", offline: "Offline. Changes are kept in this browser and will sync when the connection returns.", error: "The last sync failed. Changes are kept in this browser; retrying." } as const;

export function Account() {
  const { status, user } = useAuth();
  const sync = useSync();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try { setSessions((await api<{ sessions: SessionRow[] }>("/api/auth/sessions")).sessions); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) setMsg("Could not load sessions."); }
  }, []);
  useEffect(() => { if (status === "authed") load(); }, [status, load]);

  if (status === "loading") return <div className="mx-auto max-w-2xl px-5 py-20 text-ink-2">Loading…</div>;
  if (!user) return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <h1 className="font-display text-5xl">Account</h1>
      <p className="mt-4 text-ink-2">{status === "unavailable" ? "The account service is not reachable right now." : "You are not signed in."}</p>
      <Link href="/auth/sign-in?next=/account" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 text-sm font-medium text-bg hover:bg-signal hover:text-white">Sign in</Link>
    </div>
  );

  async function revoke(id: string) {
    try { await api(`/api/auth/sessions/${id}`, { method: "DELETE" }); await load(); } catch { setMsg("Could not revoke that session."); }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-14 md:pt-20">
      <p className="eyebrow">Account</p>
      <h1 className="font-display mt-3 text-5xl leading-none">{user.displayName ?? user.email}</h1>
      <p className="mt-2 text-sm text-ink-2">{user.email} · {user.emailVerified ? "email verified by your sign-in provider" : "email not verified"} · {user.hasPassword ? "password sign-in enabled" : "signs in with a provider"}</p>

      <section className={`${card} mt-8`} aria-labelledby="sync-h">
        <h2 id="sync-h" className="eyebrow">Progress sync</h2>
        <p role="status" className="mt-3 text-sm">{SYNC_COPY[sync.status]}{sync.status === "synced" && sync.lastSyncedAt ? ` Last sync at ${new Date(sync.lastSyncedAt).toLocaleTimeString()}.` : ""}</p>
        <p className="mt-2 text-xs text-ink-3">Signing out clears progress from this browser. It stays in your account.</p>
      </section>

      <section className={`${card} mt-4`} aria-labelledby="sess-h">
        <h2 id="sess-h" className="eyebrow">Where you are signed in</h2>
        <ul className="mt-4 divide-y divide-line">
          {(sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0"><span className="block truncate">{s.userAgent ?? "Unknown device"}{s.current && <span className="ml-2 text-ok">this device</span>}</span>
                <span className="text-xs text-ink-3">Signed in {new Date(s.createdAt).toLocaleDateString()} · last active {new Date(s.lastSeenAt).toLocaleDateString()}</span></span>
              {!s.current && <button className={btn} onClick={() => revoke(s.id)}>Sign out</button>}
            </li>
          ))}
          {sessions === null && <li className="py-3 text-sm text-ink-3">Loading…</li>}
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button className={btn} onClick={async () => { await signOut(); }}>Sign out</button>
        <button className={btn} onClick={async () => { await signOutEverywhere(); }}>Sign out everywhere</button>
      </div>

      <section className={`${card} mt-10 border-signal/40`} aria-labelledby="del-h">
        <h2 id="del-h" className="eyebrow">Delete account</h2>
        <p className="mt-3 text-sm text-ink-2">Permanently deletes your account, sessions and all saved progress. This cannot be undone.</p>
        {!confirmDelete
          ? <button className={`${btn} mt-4`} onClick={() => setConfirmDelete(true)}>Delete my account…</button>
          : <div className="mt-4 flex gap-3"><button className="inline-flex h-10 items-center rounded-full bg-signal-ink px-4 text-sm font-medium text-white" onClick={async () => { try { await deleteAccount(); } catch { setMsg("Could not delete the account."); } }}>Yes, delete everything</button><button className={btn} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
      </section>
      {msg && <p role="alert" className="mt-4 text-sm text-signal-ink">{msg}</p>}
    </div>
  );
}
