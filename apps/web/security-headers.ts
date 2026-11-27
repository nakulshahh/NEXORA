/**
 * Response headers for the web app (applied in production only: `next dev` needs eval for hot reload).
 *
 * The page CSP keeps 'unsafe-inline' for scripts because Next's App Router emits inline bootstrap scripts and our
 * theme-flash script; a nonce-based policy would force every page to render dynamically (no static/CDN caching).
 * Trade-off documented in docs/SECURITY-REVIEW.md. What the CSP still buys: no eval, no foreign script hosts, no
 * foreign connections (exfiltration), no framing, no <base>/<object> tricks, forms only to ourselves.
 *
 * The sandbox frame is a separate document with a much stricter policy of its own and is excluded from the page rule.
 */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",            // the playground sandbox frame
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const SANDBOX_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; frame-ancestors 'self'";

const COMMON = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

export function securityHeaders(production: boolean) {
  if (!production) return [];
  return [
    { source: "/((?!sandbox/).*)", headers: [
      ...COMMON,
      { key: "Content-Security-Policy", value: PAGE_CSP },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ] },
    { source: "/sandbox/:path*", headers: [...COMMON, { key: "Content-Security-Policy", value: SANDBOX_CSP }, { key: "Cache-Control", value: "no-cache" }] },
  ];
}
