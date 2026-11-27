"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ApiError, requestPasswordReset, resetPassword } from "@/lib/auth";

const field = "mt-1.5 h-11 w-full rounded-xl border border-line bg-bg px-4 text-sm outline-none transition focus:border-signal focus-visible:ring-2 focus-visible:ring-signal/30";
const btn = "h-11 w-full rounded-full bg-ink text-sm font-medium text-bg transition hover:bg-signal hover:text-white disabled:opacity-50";
const Shell = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <div className="mx-auto max-w-md px-5 pb-24 pt-14 md:pt-20"><p className="eyebrow">{eyebrow}</p><h1 className="font-display mt-3 text-5xl leading-none">{title}</h1>{children}</div>
);

export function ForgotPasswordForm() {
  const id = useId(), msg = useId();
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await requestPasswordReset(String(new FormData(e.currentTarget).get("email") ?? "")); setSent(true); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Something went wrong."); setBusy(false); }
  }
  return (
    <Shell eyebrow="Password reset" title="Forgot your password?">
      {sent ? (
        <p role="status" className="mt-6 rounded-xl border border-line bg-bg-2 p-4 text-sm text-ink-2">If an account exists for that address, a reset link is on its way. It works once and expires in 30 minutes.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-describedby={error ? msg : undefined}>
          <p className="text-sm text-ink-2">Enter your email and we will send a single-use link.</p>
          <div><label htmlFor={id} className="text-sm">Email</label><input id={id} name="email" type="email" required autoComplete="email" maxLength={254} className={field} /></div>
          {error && <p id={msg} role="alert" className="text-sm text-signal-ink">{error}</p>}
          <button type="submit" disabled={busy} className={btn}>{busy ? "Please wait…" : "Send reset link"}</button>
        </form>
      )}
      <p className="mt-6 text-sm text-ink-2"><Link className="u-link text-ink" href="/auth/sign-in">Back to sign in</Link></p>
    </Shell>
  );
}

export function ResetPasswordForm() {
  const id = useId(), msg = useId();
  const [token, setToken] = useState<string | null>(null), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  // The token is in the URL fragment so it never reaches a server log or a Referer header. Read it once, then scrub it.
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(t ?? ""); if (t) history.replaceState(null, "", window.location.pathname);
  }, []);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!token) return; setBusy(true); setError(null);
    try { await resetPassword(token, String(new FormData(e.currentTarget).get("password") ?? "")); setDone(true); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Something went wrong."); setBusy(false); }
  }
  return (
    <Shell eyebrow="Password reset" title="Choose a new password.">
      {done ? (
        <p role="status" className="mt-6 rounded-xl border border-line bg-bg-2 p-4 text-sm text-ink-2">Password changed and every device signed out. <Link className="u-link text-ink" href="/auth/sign-in">Sign in</Link> with the new one.</p>
      ) : token === "" ? (
        <p role="alert" className="mt-6 rounded-xl border border-line bg-bg-2 p-4 text-sm text-ink-2">This page needs the link from your email. <Link className="u-link text-ink" href="/auth/forgot-password">Request a new link</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-describedby={error ? msg : undefined}>
          <div><label htmlFor={id} className="text-sm">New password</label><input id={id} name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={field} />
            <p className="mt-1.5 text-xs text-ink-3">At least 10 characters. Length matters more than symbols.</p></div>
          {error && <p id={msg} role="alert" className="text-sm text-signal-ink">{error} <Link className="u-link" href="/auth/forgot-password">Request a new link</Link></p>}
          <button type="submit" disabled={busy || token === null} className={btn}>{busy ? "Please wait…" : "Set new password"}</button>
        </form>
      )}
    </Shell>
  );
}
