"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ApiError, refreshAuth, signIn, signUp, useAuth } from "@/lib/auth";

const OAUTH_ERRORS: Record<string, string> = {
  state: "That sign-in attempt could not be verified. Please try again.",
  expired: "That sign-in attempt expired. Please try again.",
  provider: "The provider did not complete the sign-in. Please try again.",
  no_verified_email: "The provider did not share a verified email address, so we cannot create an account from it.",
};
const GithubMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.08-1.88 3.76-3.66 3.96.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
);
const PROVIDER_LABEL: Record<string, string> = { github: "GitHub", google: "Google" };

/** Same-site relative paths only. Mirrors the server's own check. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/learn");

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user, oauth } = useAuth();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(OAUTH_ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  const ids = { email: useId(), password: useId(), name: useId(), msg: useId() };
  const signup = mode === "sign-up";

  useEffect(() => { if (status === "authed") router.replace(next); }, [status, next, router]);
  useEffect(() => { if (status === "loading") refreshAuth(); }, [status]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? ""); const password = String(f.get("password") ?? ""); const name = String(f.get("name") ?? "").trim();
    setBusy(true); setError(null);
    try { signup ? await signUp(email, password, name || undefined) : await signIn(email, password); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Something went wrong."); setBusy(false); }
  }

  const unavailable = status === "unavailable";
  const field = "mt-1.5 h-11 w-full rounded-xl border border-line bg-bg px-4 text-sm outline-none transition focus:border-signal focus-visible:ring-2 focus-visible:ring-signal/30";

  return (
    <div className="mx-auto max-w-md px-5 pb-24 pt-14 md:pt-20">
      <p className="eyebrow">{signup ? "Create account" : "Sign in"}</p>
      <h1 className="font-display mt-3 text-5xl leading-none">{signup ? "Keep your progress." : "Welcome back."}</h1>
      <p className="mt-3 text-sm text-ink-2">
        {signup ? "An account saves your progress to the server so it follows you across devices." : "Sign in to sync your progress."}{" "}
        Progress you made on this device before signing in is added to your account.
      </p>

      {unavailable && <p role="alert" className="mt-6 rounded-xl border border-line bg-bg-2 p-4 text-sm text-ink-2">The account service is not reachable right now. You can keep learning; progress is saved in this browser and syncs after you sign in.</p>}

      {oauth.length > 0 && (
        <div className="mt-8 space-y-2.5">
          {oauth.map((p) => (
            // A real navigation (not fetch): the server redirects to the provider and back.
            <a key={p} href={`/api/auth/oauth/${p}/start?next=${encodeURIComponent(next)}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line-strong text-sm font-medium transition hover:border-ink">
              {p === "github" ? <GithubMark /> : <span aria-hidden className="font-mono text-xs">G</span>}
              Continue with {PROVIDER_LABEL[p] ?? p}
            </a>
          ))}
          <p className="pt-3 text-center text-xs text-ink-3">or use email</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate={false} aria-describedby={error ? ids.msg : undefined}>
        {signup && (<div><label htmlFor={ids.name} className="text-sm">Name <span className="text-ink-3">(optional)</span></label>
          <input id={ids.name} name="name" autoComplete="name" maxLength={80} className={field} /></div>)}
        <div><label htmlFor={ids.email} className="text-sm">Email</label>
          <input id={ids.email} name="email" type="email" required autoComplete="email" maxLength={254} className={field} /></div>
        <div><label htmlFor={ids.password} className="text-sm">Password</label>
          <input id={ids.password} name="password" type="password" required minLength={signup ? 10 : 1} maxLength={128} autoComplete={signup ? "new-password" : "current-password"} className={field} />
          {signup && <p className="mt-1.5 text-xs text-ink-3">At least 10 characters. Length matters more than symbols.</p>}
          {!signup && <p className="mt-1.5 text-xs"><Link className="u-link text-ink-2" href="/auth/forgot-password">Forgot your password?</Link></p>}</div>
        {error && <p id={ids.msg} role="alert" className="text-sm text-signal-ink">{error}</p>}
        <button type="submit" disabled={busy || unavailable} className="h-11 w-full rounded-full bg-ink text-sm font-medium text-bg transition hover:bg-signal hover:text-white disabled:opacity-50">
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        {signup ? <>Already have an account? <Link className="u-link text-ink" href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link></> : <>New here? <Link className="u-link text-ink" href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></>}
      </p>
      <p className="mt-8 text-xs text-ink-3">Sign-in with GitHub or Google verifies your email for you. Password reset email needs a mail provider to be configured on the server.</p>
    </div>
  );
}
