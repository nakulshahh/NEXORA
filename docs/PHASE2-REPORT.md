# Phase 2 report: Break-it Lab and Concurrency Arena

Both features reuse the existing stack, run entirely in the browser, and are deterministic (seeded or schedule-driven). No new dependencies, services or paid APIs.

| Feature | Route | Engine | What was verified |
|---|---|---|---|
| Break-it Lab | `/labs/break-it` | `lib/arch/load.ts` v2, `lib/arch/incidents.ts` | 7 incidents each break as shipped; reference fixes pass; tempting fixes fail; determinism; e2e guided + open mode at 1280 and 390 px |
| Concurrency Arena | `/labs/concurrency` | `sim/conc.ts` | Exhaustive: every unsafe version has a failing schedule, every safe version has 0 failing schedules and no deadlock; replay of every reported outcome; sequential schedule hides the race; e2e at 1280 and 390 px |

## Checks run in the sandbox
- Web: typecheck clean, 248 tests pass, production build succeeds.
- e2e (Playwright, Chrome): `breakit_smoke.py`, `concurrency_smoke.py` pass at 1280 and 390 px with no horizontal overflow and no page errors. `sims_smoke.py` reports only the known 500s from `/api/auth/*` (no API running here).
- Accessibility: axe-core (WCAG 2.0/2.1 A and AA) reports 0 violations on both labs at both widths. It found and we fixed: a list-role conflict on the Arena log, low contrast on selected incident chips, the log timestamps, and the primary-button hover colour.

## Not verified (needs you)
- Real screen-reader sessions (VoiceOver/NVDA); axe only catches part of accessibility.
- Firefox and Safari.
- Real touch devices (emulated 390 px only).
- Everything listed in `docs/PHASE1-REPORT.md` under manual actions (Docker, Kubernetes, CI, deploy, OAuth, SMTP adapter, MiniLM measurement).

## Honest limits of the models
See the "Honest limits" paragraphs in `docs/LEARNING.md` (Phase 13 and Phase 14). Short version: Break-it is a single-queue model with illustrative numbers; the Arena assumes sequential consistency.

## Your manual steps
1. Unpack `nexora-m16.tar.gz` over your Desktop folder.
2. `bash scripts/make-commits.sh`, then `git push`.
3. Run migration `0002` on Neon before deploying the API (rate limits and password resets).
