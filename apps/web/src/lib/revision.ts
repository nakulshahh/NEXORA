import { DAY, isDue, newReview, weakness, type Review } from "./srs";
import type { Progress } from "./progress";
import { reviewKey } from "./progress";

export interface Card { chapter: string; lesson: string; lessonTitle: string; id: string; kind: string; prompt: string; options: string[]; answer: number; explain: string }
export const cardKey = (c: Card) => reviewKey(c.chapter, c.lesson, c.id);

/** Due cards, most overdue first. Cards whose exercise no longer exists in the content are skipped, never shown broken. */
export function dueCards(p: Progress, cards: Card[], now: number, limit = 20): Card[] {
  return cards
    .filter((c) => { const r = p.reviews[cardKey(c)]; return r && isDue(r, now); })
    .sort((a, b) => p.reviews[cardKey(a)]!.due - p.reviews[cardKey(b)]!.due || cardKey(a).localeCompare(cardKey(b)))
    .slice(0, limit);
}

/** Earliest future due time among known cards, or null. */
export function nextDue(p: Progress, cards: Card[], now: number): number | null {
  const ds = cards.map((c) => p.reviews[cardKey(c)]).filter((r): r is Review => !!r && r.due > now).map((r) => r.due);
  return ds.length ? Math.min(...ds) : null;
}

export const knownCardCount = (p: Progress, cards: Card[]) => cards.filter((c) => p.reviews[cardKey(c)]).length;

/**
 * Progress saved before revision existed has answered exercises but no schedule. Give each such card one, due now,
 * from what we do know (one attempt and correct = first try correct). We do not know when it was answered, so we say so
 * by making it immediately reviewable rather than pretending an interval.
 */
export function missingReviews(p: Progress, now: number): Record<string, Review> {
  const out: Record<string, Review> = {};
  for (const [lk, l] of Object.entries(p.lessons)) for (const [id, e] of Object.entries(l.exercises)) {
    if (e.attempts < 1) continue;
    const k = `${lk}/${id}`;
    if (!p.reviews[k]) out[k] = { ...newReview(e.correct && e.attempts === 1, now), due: now };
  }
  return out;
}

export interface WeakLesson { chapter: string; lesson: string; title: string; score: number; cards: number; struggling: number; concepts: string[] }

/** Lessons ranked by how much their cards have hurt: first-try misses, lapses and low ease. Only lessons with some weakness appear. */
export function weakLessons(p: Progress, cards: Card[], concepts: Record<string, string[]>): WeakLesson[] {
  const by = new Map<string, WeakLesson>();
  for (const c of cards) {
    const r = p.reviews[cardKey(c)]; if (!r) continue;
    const lk = `${c.chapter}/${c.lesson}`;
    const w = by.get(lk) ?? { chapter: c.chapter, lesson: c.lesson, title: c.lessonTitle, score: 0, cards: 0, struggling: 0, concepts: concepts[lk] ?? [] };
    const s = weakness(r);
    w.cards += 1; w.score += s; if (s > 0) w.struggling += 1;
    by.set(lk, w);
  }
  return [...by.values()].filter((w) => w.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export const describeIn = (ms: number) => {
  const d = Math.ceil(ms / DAY);
  return d <= 1 ? "tomorrow" : `in ${d} days`;
};
