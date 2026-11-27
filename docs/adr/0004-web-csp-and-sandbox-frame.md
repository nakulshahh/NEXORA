# ADR 0004: Page CSP, and the playground sandbox as its own document

Status: accepted (Milestone 8)

## Context
The web app needs a Content-Security-Policy. Two things pull against it:

1. Next.js's App Router emits inline bootstrap scripts, and our theme script avoids a flash of the wrong theme by running inline before first paint.
2. The event-loop playground runs user-typed (but whitelist-validated) JavaScript in a sandboxed iframe. It was a `srcdoc` iframe whose code ran through `new Function`, which needs `'unsafe-eval'`. A `srcdoc` document **inherits the embedding page's CSP**, so a strict page policy would have to allow eval everywhere for the sake of one frame.

## Decision
- **Page policy:** `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (no eval), `connect-src 'self'`, `frame-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, plus HSTS, `nosniff`, `X-Frame-Options: DENY`, a locked-down `Permissions-Policy`, COOP. Applied in production only (`next dev` needs eval for hot reload).
- **Sandbox:** a separate static document, `/sandbox/frame.html`, loaded by URL into `<iframe sandbox="allow-scripts">` (opaque origin, no `allow-same-origin`). It is served with its own header: `default-src 'none'; script-src 'self' 'unsafe-eval'; frame-ancestors 'self'`. Its script is an external file, so there is no inline script in it either.
- The sandbox path is excluded from the page rule with a negative-lookahead `source`, so exactly one policy applies to each response.

## Consequences
- The only place eval is allowed is a document with no network, no storage and no parent access. The application proper never allows it.
- `'unsafe-inline'` for scripts stays on pages. A nonce-based policy would need every page rendered per request, which gives up static generation and CDN caching, a poor trade for a site with no user-authored HTML. Revisit if that changes.
- The sandbox frame now makes one extra same-origin request (HTML plus JS, both tiny). The frame is created only when a program is run.
- Verified in Chrome against the production build (isolation probe: cookies, parent DOM, `fetch` to own origin and to an external site, and nested frames all fail inside the frame). Firefox and Safari are not verified.

## Rejected
- **`srcdoc` with `'unsafe-eval'` in the page CSP:** weakens the whole app for one feature.
- **A nonce for the sandbox's inline script under the page CSP:** still requires eval allowance on the page, and srcdoc inheritance would still apply.
- **Web Worker from the page:** runs with our origin and could `fetch` our API with the user's cookies.
