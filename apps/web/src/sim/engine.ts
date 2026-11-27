/**
 * Simulation engine core. Pure TypeScript: no React, no DOM, no Date, no Math.random.
 * Every scenario is a function of (params, seed) -> Step[], so it is deterministic,
 * unit-testable, shareable through a URL, and "reset" is just "go back to index 0".
 */
export interface Step<S> {
  id: string;
  label: string;
  /** The annotation shown for this step and read out in the transcript. */
  explain: string;
  state: S;
  /** Simulated duration in ms (what the step would cost in real life, simplified). */
  ms: number;
}
export type Scenario<P, S> = (params: P, seed: number) => Step<S>[];

export type ParamDef =
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; kind: "range"; min: number; max: number; step: number; unit?: string; hint?: string };
export type Params = Record<string, string | number>;

export interface SimSpec<S = unknown> {
  id: string;
  title: string;
  /** Honesty rule: what this model simplifies. Rendered under every simulation. */
  simplifies: string[];
  params: ParamDef[];
  defaults: Params;
  scenario: Scenario<Params, S>;
}

/** mulberry32: tiny, fast, seedable. Same seed, same sequence, on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Untrusted query-string values in, a valid Params out: unknown keys dropped, ranges clamped, selects checked. */
export function parseParams(defs: ParamDef[], defaults: Params, q: Record<string, string | undefined>): Params {
  const out: Params = { ...defaults };
  for (const d of defs) {
    const raw = q[d.key];
    if (raw == null) continue;
    if (d.kind === "select") { if (d.options.some((o) => o.value === raw)) out[d.key] = raw; }
    else {
      const n = Number(raw);
      if (Number.isFinite(n)) out[d.key] = Math.min(d.max, Math.max(d.min, Math.round(n / d.step) * d.step));
    }
  }
  return out;
}

export const parseSeed = (raw: string | undefined) => { const n = Number(raw); return Number.isInteger(n) && n >= 0 && n < 1e6 ? n : 7; };

/** Only non-default values are written to the URL, so the default scenario has a clean address. */
export function toQuery(defaults: Params, p: Params, seed: number, step: number): Record<string, string> {
  const q: Record<string, string> = {};
  for (const k of Object.keys(p)) if (p[k] !== defaults[k]) q[k] = String(p[k]);
  if (seed !== 7) q.seed = String(seed);
  if (step > 0) q.step = String(step);
  return q;
}
export const round1 = (n: number) => Math.round(n * 10) / 10;
