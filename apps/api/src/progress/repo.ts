import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activityEvents, completedChapters, cardReviews, exerciseState, knownChapters, lessonProgress, users } from "../db/schema.js";
import { EMPTY_DOC, splitKey, splitReviewKey, type ProgressDoc } from "./model.js";

const MAX_EVENTS = 200;

export async function readProgress(db: Db, userId: string): Promise<ProgressDoc> {
  const [u] = await db.select({ last: users.lastChapter }).from(users).where(eq(users.id, userId));
  const [known, completed, lessons, exercises, events, reviews] = await Promise.all([
    db.select({ c: knownChapters.chapter }).from(knownChapters).where(eq(knownChapters.userId, userId)).orderBy(asc(knownChapters.chapter)),
    db.select({ c: completedChapters.chapter }).from(completedChapters).where(eq(completedChapters.userId, userId)).orderBy(asc(completedChapters.chapter)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId)),
    db.select().from(exerciseState).where(eq(exerciseState.userId, userId)),
    db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.t)).limit(MAX_EVENTS),
    db.select().from(cardReviews).where(eq(cardReviews.userId, userId)),
  ]);
  const doc: ProgressDoc = { ...EMPTY_DOC, known: known.map((r) => r.c), completed: completed.map((r) => r.c), last: u?.last ?? null, events: events.reverse().map((e) => ({ t: e.t, kind: e.kind as ProgressDoc["events"][number]["kind"], chapter: e.chapter })), lessons: {}, reviews: {} };
  for (const l of lessons) doc.lessons[`${l.chapter}/${l.slug}`] = { done: l.done, scroll: l.scroll, exercises: {} };
  for (const e of exercises) { const l = doc.lessons[`${e.chapter}/${e.slug}`]; if (l) l.exercises[e.exerciseId] = { attempts: e.attempts, correct: e.correct }; }
  for (const r of reviews) doc.reviews[`${r.chapter}/${r.slug}/${r.exerciseId}`] = { ease: r.easeX100 / 100, interval: r.intervalDays, reps: r.reps, lapses: r.lapses, due: r.due, last: r.last, first: r.first };
  return doc;
}

/**
 * Merge an incoming document into the stored one. Every rule is monotonic and idempotent, so the same document can be
 * sent twice, or from two devices, and the result only ever moves forward:
 *   done / correct / completed : OR      scroll : max      attempts : max      events : set union
 *   reviews : newest review wins per card (last-writer-wins register; ties by reps, lapses, due, ease)
 *   known : union on first import, replace afterwards (last writer wins; documented trade-off)
 * Attempts use max, not sum, precisely so that re-sending a document cannot inflate them.
 */
export async function mergeProgress(db: Db, userId: string, doc: ProgressDoc, knownMode: "union" | "replace" | "keep"): Promise<void> {
  await db.transaction(async (tx) => {
    if (knownMode === "replace") {
      await (doc.known.length
        ? tx.delete(knownChapters).where(and(eq(knownChapters.userId, userId), notInArray(knownChapters.chapter, doc.known)))
        : tx.delete(knownChapters).where(eq(knownChapters.userId, userId)));
    }
    if (knownMode !== "keep" && doc.known.length) await tx.insert(knownChapters).values(doc.known.map((chapter) => ({ userId, chapter }))).onConflictDoNothing();
    if (doc.completed.length) await tx.insert(completedChapters).values(doc.completed.map((chapter) => ({ userId, chapter }))).onConflictDoNothing();
    if (doc.last) await tx.update(users).set({ lastChapter: doc.last }).where(eq(users.id, userId));

    const lessonRows = Object.entries(doc.lessons).map(([key, l]) => { const [chapter, slug] = splitKey(key); return { userId, chapter, slug, done: l.done, scroll: l.scroll }; });
    if (lessonRows.length) {
      await tx.insert(lessonProgress).values(lessonRows).onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.chapter, lessonProgress.slug],
        set: { done: sql`${lessonProgress.done} OR excluded.done`, scroll: sql`GREATEST(${lessonProgress.scroll}, excluded.scroll)`, updatedAt: sql`now()` },
      });
    }
    const exRows = Object.entries(doc.lessons).flatMap(([key, l]) => { const [chapter, slug] = splitKey(key); return Object.entries(l.exercises).map(([exerciseId, s]) => ({ userId, chapter, slug, exerciseId, attempts: s.attempts, correct: s.correct })); });
    if (exRows.length) {
      await tx.insert(exerciseState).values(exRows).onConflictDoUpdate({
        target: [exerciseState.userId, exerciseState.chapter, exerciseState.slug, exerciseState.exerciseId],
        set: { attempts: sql`GREATEST(${exerciseState.attempts}, excluded.attempts)`, correct: sql`${exerciseState.correct} OR excluded.correct` },
      });
    }
    const revRows = Object.entries(doc.reviews).map(([key, r]) => { const [chapter, slug, exerciseId] = splitReviewKey(key); return { userId, chapter, slug, exerciseId, easeX100: Math.round(r.ease * 100), intervalDays: r.interval, reps: r.reps, lapses: r.lapses, due: r.due, last: r.last, first: r.first }; });
    if (revRows.length) {
      // Last-writer-wins per card, with the same tie-break order as the client (last, reps, lapses, due, ease).
      await tx.insert(cardReviews).values(revRows).onConflictDoUpdate({
        target: [cardReviews.userId, cardReviews.chapter, cardReviews.slug, cardReviews.exerciseId],
        set: { easeX100: sql`excluded.ease_x100`, intervalDays: sql`excluded.interval_days`, reps: sql`excluded.reps`, lapses: sql`excluded.lapses`, due: sql`excluded.due`, last: sql`excluded.last`, first: sql`excluded.first` },
        setWhere: sql`(excluded.last, excluded.reps, excluded.lapses, excluded.due, excluded.ease_x100) > (${cardReviews.last}, ${cardReviews.reps}, ${cardReviews.lapses}, ${cardReviews.due}, ${cardReviews.easeX100})`,
      });
    }
    if (doc.events.length) await tx.insert(activityEvents).values(doc.events.map((e) => ({ userId, ...e }))).onConflictDoNothing();
    // keep the newest MAX_EVENTS per user
    await tx.execute(sql`DELETE FROM activity_events WHERE user_id = ${userId} AND id NOT IN (SELECT id FROM activity_events WHERE user_id = ${userId} ORDER BY t DESC, id DESC LIMIT ${MAX_EVENTS})`);
  });
}

export async function resetProgress(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of [knownChapters, completedChapters, lessonProgress, exerciseState, activityEvents, cardReviews]) await tx.delete(t).where(eq(t.userId, userId));
    await tx.update(users).set({ lastChapter: null }).where(eq(users.id, userId));
  });
}
