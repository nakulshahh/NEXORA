"use client";
import { useSyncExternalStore } from "react";
import { ALL_CHAPTERS } from "@/data/curriculum";
import { newReview, sanitizeReviews, schedule, type Grade, type Review } from "./srs";

/**
 * Local-only learning state (anonymous learner, per blueprint §7.1: syncs to the account in M5).
 * "known" = learner self-reports they already know a chapter. "completed" is reserved for
 * lessons, which ship in M3 — nothing in M2 can set it, so no stat is ever invented.
 */
export interface ActivityEvent { t: number; kind: "visit" | "known" | "unknown" | "lesson"; chapter: string }
export interface ExerciseState { attempts: number; correct: boolean }
export interface LessonState { done: boolean; exercises: Record<string, ExerciseState>; scroll: number }
export interface Progress { known: string[]; completed: string[]; last: string | null; events: ActivityEvent[]; lessons: Record<string, LessonState>; reviews: Record<string, Review> }
/** Review key: `<chapter>/<lesson slug>/<exercise id>`. */
export const reviewKey = (chapter: string, slug: string, exerciseId: string) => `${chapter}/${slug}/${exerciseId}`;

const KEY = "nexora-progress-v1";
export const EMPTY: Progress = { known: [], completed: [], last: null, events: [], lessons: {}, reviews: {} };
let cache: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return sanitize(JSON.parse(raw) as Partial<Progress>);
  } catch { return EMPTY; }
}
/** Shape and filter an untrusted document (from storage or from the server) into a valid Progress. */
export function sanitize(p: Partial<Progress>): Progress {
  {
    const ids = new Set(ALL_CHAPTERS.map((c) => c.id));
    return {
      known: (p.known ?? []).filter((x) => ids.has(x)),
      completed: (p.completed ?? []).filter((x) => ids.has(x)),
      last: p.last && ids.has(p.last) ? p.last : null,
      events: (p.events ?? []).filter((e) => ids.has(e.chapter)).slice(-200),
      lessons: p.lessons && typeof p.lessons === "object" ? p.lessons : {},
      reviews: sanitizeReviews(p.reviews),
    };
  }
}
const snapshot = () => (cache ??= load());
/** Called after every change made on this device (not after `replaceProgress`); the sync agent listens here. */
const localChange = new Set<() => void>();
export const onLocalChange = (cb: () => void) => { localChange.add(cb); return () => { localChange.delete(cb); }; };
/** Replace the whole document with one that came from the server (or clear it), without triggering a push. */
export function replaceProgress(next: Progress) { write(next, false); }

function write(next: Progress, local = true) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l());
  if (local) localChange.forEach((l) => l());
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { cache = null; listeners.forEach((l) => l()); } });

export function useProgress(): Progress {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, snapshot, () => EMPTY);
}
export function recordVisit(chapter: string) {
  const p = snapshot();
  const last = p.events[p.events.length - 1];
  if (last && last.kind === "visit" && last.chapter === chapter && Date.now() - last.t < 60_000) return;
  write({ ...p, last: chapter, events: [...p.events, { t: Date.now(), kind: "visit" as const, chapter }].slice(-200) });
}
export function toggleKnown(chapter: string) {
  const p = snapshot(); const on = p.known.includes(chapter);
  write({ ...p, known: on ? p.known.filter((x) => x !== chapter) : [...p.known, chapter], events: [...p.events, { t: Date.now(), kind: (on ? "unknown" : "known") as ActivityEvent["kind"], chapter }].slice(-200) });
}

export type ChapterState = "completed" | "known" | "ready" | "locked";
/**
 * Lessons. A lesson is done when every one of its exercises has been answered correctly at least once
 * (attempts are kept, so a wrong first answer is never hidden). A chapter is completed when all of its
 * authored lessons are done. Both are derived from recorded answers, never set by a button.
 */
const blank = (): LessonState => ({ done: false, exercises: {}, scroll: 0 });
export const lessonStateOf = (p: Progress, chapter: string, slug: string): LessonState => p.lessons[`${chapter}/${slug}`] ?? blank();
export function answerExercise(chapter: string, slug: string, exerciseId: string, correct: boolean, lessonExercises: string[], chapterLessons: { slug: string; exercises: string[] }[]) {
  const p = snapshot(); const key = `${chapter}/${slug}`;
  const cur = p.lessons[key] ?? blank();
  const prev = cur.exercises[exerciseId] ?? { attempts: 0, correct: false };
  const exercises = { ...cur.exercises, [exerciseId]: { attempts: prev.attempts + 1, correct: prev.correct || correct } };
  const done = lessonExercises.every((id) => exercises[id]?.correct);
  const lessons = { ...p.lessons, [key]: { ...cur, exercises, done } };
  const chapterDone = chapterLessons.length > 0 && chapterLessons.every((l) => lessons[`${chapter}/${l.slug}`]?.done);
  const justDone = done && !cur.done;
  // The first answer to a card (in its lesson) puts it in the revision queue. Retries after a miss do not reschedule it.
  const rk = reviewKey(chapter, slug, exerciseId);
  const reviews = p.reviews[rk] ? p.reviews : { ...p.reviews, [rk]: newReview(correct && prev.attempts === 0, Date.now()) };
  write({
    ...p, lessons, reviews, last: chapter,
    completed: chapterDone && !p.completed.includes(chapter) ? [...p.completed, chapter] : p.completed,
    events: justDone ? [...p.events, { t: Date.now(), kind: "lesson" as const, chapter }].slice(-200) : p.events,
  });
}
export function setScroll(chapter: string, slug: string, frac: number) {
  const p = snapshot(); const key = `${chapter}/${slug}`; const cur = p.lessons[key] ?? blank();
  const f = Math.max(cur.scroll, Math.min(1, Math.round(frac * 100) / 100));
  if (f === cur.scroll) return;
  write({ ...p, lessons: { ...p.lessons, [key]: { ...cur, scroll: f } } });
}
/** Derived metric for the dashboard: lessons with every exercise answered correctly. */
export const lessonsDone = (p: Progress) => Object.values(p.lessons).filter((l) => l.done).length;

/** Locked = some prerequisite is neither completed nor marked known. */
export function chapterState(id: string, p: Progress, prereqs: string[]): ChapterState {
  if (p.completed.includes(id)) return "completed";
  if (p.known.includes(id)) return "known";
  return prereqs.every((r) => p.known.includes(r) || p.completed.includes(r)) ? "ready" : "locked";
}

/** Day keys (local) with any activity, and the current run of consecutive days ending today/yesterday. */
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function streakOf(events: ActivityEvent[], now = Date.now()) {
  const days = new Set(events.map((e) => dayKey(e.t)));
  let n = 0; let t = now;
  if (!days.has(dayKey(t))) t -= 86_400_000;
  while (days.has(dayKey(t))) { n++; t -= 86_400_000; }
  return { days, streak: n };
}

/** Non-hook accessors: used by tests, and later by a "reset progress" control. */
export const getProgress = snapshot;
export function resetProgress() { write(EMPTY); }
/** Clears this browser without telling the server (used on sign-out). */
export function clearLocalProgress() { write(EMPTY, false); }

/** Record a revision-page answer for a card that is already in the queue. Unknown keys are ignored. */
export function gradeReview(key: string, grade: Grade, now = Date.now()) {
  const p = snapshot(); const r = p.reviews[key];
  if (!r) return;
  write({ ...p, reviews: { ...p.reviews, [key]: schedule(r, grade, now) } });
}

/** Seed schedules for answered exercises that predate revision (see `missingReviews`). No-op when nothing is missing. */
export function seedMissingReviews(missing: Record<string, Review>) {
  if (!Object.keys(missing).length) return;
  const p = snapshot();
  write({ ...p, reviews: { ...missing, ...p.reviews } });
}
