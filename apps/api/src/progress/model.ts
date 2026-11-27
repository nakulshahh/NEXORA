import { z } from "zod";

/** Mirrors the web app's local `Progress` document (apps/web/src/lib/progress.ts). Strictly bounded: this is untrusted input. */
const chapterId = z.string().regex(/^[0-9A-Za-z.]{1,8}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const lessonKey = z.string().regex(/^[0-9A-Za-z.]{1,8}\/[a-z0-9][a-z0-9-]{0,79}$/);
const exerciseId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);

const Review = z.object({
  ease: z.number().min(1.3).max(5), interval: z.number().int().min(1).max(365), reps: z.number().int().min(0).max(10_000),
  lapses: z.number().int().min(0).max(10_000), due: z.number().min(0).max(4_102_444_800_000), last: z.number().min(0).max(4_102_444_800_000), first: z.boolean(),
});
const reviewKey = z.string().regex(/^[0-9A-Za-z.]{1,8}\/[a-z0-9][a-z0-9-]{0,79}\/[a-z0-9][a-z0-9-]{0,79}$/);

export const ProgressDoc = z.object({
  known: z.array(chapterId).max(100),
  completed: z.array(chapterId).max(100),
  last: chapterId.nullable(),
  events: z.array(z.object({
    t: z.number().int().min(0).max(4_102_444_800_000),
    kind: z.enum(["visit", "known", "unknown", "lesson"]),
    chapter: chapterId,
  })).max(200),
  lessons: z.record(lessonKey, z.object({
    done: z.boolean(),
    scroll: z.number().min(0).max(1),
    exercises: z.record(exerciseId, z.object({ attempts: z.number().int().min(0).max(10_000), correct: z.boolean() })),
  })).refine((o) => Object.keys(o).length <= 500, "too many lessons")
    .refine((o) => Object.values(o).reduce((n, l) => n + Object.keys(l.exercises).length, 0) <= 2000, "too many exercises"),
  /** Older clients omit it. */
  reviews: z.record(reviewKey, Review).refine((o) => Object.keys(o).length <= 2000, "too many reviews").default({}),
});
export type ProgressDoc = z.infer<typeof ProgressDoc>;

export const MergeBody = z.object({
  progress: ProgressDoc,
  /**
   * How to treat `progress.known`.
   * "union": first import of an anonymous document.  "replace": the client holds the merged state, so removals count.
   * "keep": ignore the client's list (a pull on page load; the response carries the server's list).
   */
  knownMode: z.enum(["union", "replace", "keep"]).default("union"),
});

export const splitKey = (k: string): [string, string] => { const i = k.indexOf("/"); return [k.slice(0, i), k.slice(i + 1)]; };
export const EMPTY_DOC: ProgressDoc = { known: [], completed: [], last: null, events: [], lessons: {}, reviews: {} };
export const splitReviewKey = (k: string): [string, string, string] => { const [c, s, e] = k.split("/"); return [c!, s!, e!]; };
