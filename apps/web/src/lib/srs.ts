/**
 * SM-2 spaced repetition (Wozniak, 1987), as a pure function. No clock, no storage: callers pass `now`.
 *
 * A card has an ease factor (how fast its interval grows), a repetition count, and an interval in days.
 * Quality is 0..5; we use three correct grades (3 hard, 4 good, 5 easy) and one failing grade (1).
 *   q < 3  : lapse. reps = 0, interval = 1 day, ease drops a little (SM-2 itself leaves ease alone on a lapse; many
 *            implementations penalise it. We do, by 0.2, because a card that keeps failing should be seen more often).
 *   q >= 3 : reps 0 -> 1 day, reps 1 -> 6 days, then interval * ease. Ease moves by 0.1 - (5-q)(0.08 + (5-q)0.02), floor 1.3.
 */
export interface Review {
  ease: number;      // >= 1.3
  interval: number;  // days, integer >= 1
  reps: number;      // consecutive successful reviews
  lapses: number;    // times it was failed after being learned
  due: number;       // ms since epoch
  last: number;      // ms since epoch of the latest review; the sync merge keeps the newest
  first: boolean;    // first-ever answer was correct (what the lesson recorded)
}
export type Grade = 1 | 3 | 4 | 5;
export const DAY = 86_400_000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const MAX_INTERVAL = 365;

/** First sight of a card (answered in its lesson): schedule it from that single result. */
export function newReview(firstTryCorrect: boolean, now: number): Review {
  return schedule({ ease: START_EASE, interval: 0, reps: 0, lapses: 0, due: now, last: now, first: firstTryCorrect }, firstTryCorrect ? 4 : 1, now, true);
}

export function schedule(r: Review, q: Grade, now: number, initial = false): Review {
  let { ease, interval, reps, lapses } = r;
  if (q < 3) {
    if (!initial) lapses += 1;
    reps = 0; interval = 1; ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease);
    reps += 1;
    ease = Math.max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }
  interval = Math.min(MAX_INTERVAL, Math.max(1, interval));
  return { ...r, ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: now + interval * DAY, last: now };
}

export const isDue = (r: Review, now: number) => r.due <= now;

/** Newer review wins; ties fall through reps, lapses, due, ease (deterministic, so both devices converge). */
export const newer = (a: Review, b: Review): Review => {
  for (const k of ["last", "reps", "lapses", "due", "ease"] as const) if (a[k] !== b[k]) return a[k] > b[k] ? a : b;
  return a;
};

/** Combine two review maps, per card. Commutative, associative and idempotent. */
export function mergeReviews(a: Record<string, Review>, b: Record<string, Review>): Record<string, Review> {
  const out: Record<string, Review> = { ...a };
  for (const [k, r] of Object.entries(b)) out[k] = out[k] ? newer(out[k]!, r) : r;
  return out;
}

/** Weakness of a card: 0 = fine. Failing the first try, lapses and a low ease each add to it. */
export const weakness = (r: Review) => (r.first ? 0 : 1) + r.lapses * 1.5 + Math.max(0, (START_EASE - r.ease) * 2);

const KEY = /^[0-9A-Za-z.]{1,8}\/[a-z0-9][a-z0-9-]{0,79}\/[a-z0-9][a-z0-9-]{0,79}$/;
const num = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
/** Shape an untrusted map (localStorage or server) into valid reviews; invalid entries are dropped, never repaired. */
export function sanitizeReviews(x: unknown): Record<string, Review> {
  const out: Record<string, Review> = {};
  if (!x || typeof x !== "object") return out;
  for (const [k, v] of Object.entries(x as Record<string, Partial<Review>>)) {
    if (!KEY.test(k) || !v || typeof v !== "object") continue;
    if (num(v.ease, MIN_EASE, 5) && num(v.interval, 1, MAX_INTERVAL) && Number.isInteger(v.interval) && num(v.reps, 0, 10_000) && Number.isInteger(v.reps)
      && num(v.lapses, 0, 10_000) && Number.isInteger(v.lapses) && num(v.due, 0, 4_102_444_800_000) && num(v.last, 0, 4_102_444_800_000) && typeof v.first === "boolean")
      out[k] = { ease: v.ease, interval: v.interval, reps: v.reps, lapses: v.lapses, due: v.due, last: v.last, first: v.first };
  }
  return out;
}
