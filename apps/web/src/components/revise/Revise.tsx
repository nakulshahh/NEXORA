"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { clsx } from "clsx";
import raw from "@/data/cards.generated.json";
import { gradeReview, seedMissingReviews, useProgress } from "@/lib/progress";
import { cardKey, describeIn, dueCards, knownCardCount, missingReviews, nextDue, weakLessons, type Card } from "@/lib/revision";
import { lessonHref } from "@/data/lessons";
import { partSlugOf } from "@/lib/routes";
import type { Grade } from "@/lib/srs";

const CARDS = (raw as { cards: Card[] }).cards;
const CONCEPTS = (raw as { concepts: Record<string, string[]> }).concepts;
const GRADES: { g: Grade; label: string; hint: string }[] = [{ g: 3, label: "Hard", hint: "I had to think" }, { g: 4, label: "Good", hint: "As expected" }, { g: 5, label: "Easy", hint: "Instant" }];
const lessonLink = (c: { chapter: string; lesson: string }) => lessonHref(partSlugOf(c.chapter), c.chapter, c.lesson);

type Session = { queue: string[]; total: number; done: number; missed: number; retried: Set<string> };

export function Revise() {
  const progress = useProgress();
  const [now, setNow] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const seeded = useRef(false);

  useEffect(() => { setNow(Date.now()); }, []);
  useEffect(() => {   // progress saved before revision existed: give answered exercises a schedule once
    if (now === null || seeded.current) return;
    seeded.current = true; seedMissingReviews(missingReviews(progress, now));
  }, [now, progress]);

  const byKey = useMemo(() => new Map(CARDS.map((c) => [cardKey(c), c])), []);
  const due = useMemo(() => (now === null ? [] : dueCards(progress, CARDS, now)), [progress, now]);
  const known = knownCardCount(progress, CARDS);
  const weak = useMemo(() => weakLessons(progress, CARDS, CONCEPTS), [progress]);

  if (now === null) return <p className="text-ink-2">Loading your cards…</p>;

  if (session) {
    const key = session.queue[0];
    const card = key ? byKey.get(key) : undefined;
    if (!card) return <Summary s={session} onDone={() => { setSession(null); setNow(Date.now()); }} />;
    const practice = session.retried.has(key!);   // second pass after a miss: practice only, the first answer already scheduled it
    return <CardView key={`${key}${practice ? "-again" : ""}`} card={card} s={session} practice={practice} onGrade={(g) => {
      if (!practice) gradeReview(cardKey(card), g);
      setSession((s) => {
        if (!s) return s;
        const k = cardKey(card); const rest = s.queue.slice(1);
        const miss = g === 1 && !practice; const again = miss && !s.retried.has(k);
        const retried = new Set(s.retried); if (again) retried.add(k);
        return { ...s, queue: again ? [...rest, k] : rest, done: s.done + (again ? 0 : 1), missed: s.missed + (miss ? 1 : 0), retried };
      });
    }} />;
  }

  const next = nextDue(progress, CARDS, now);
  return (
    <div>
      {known === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="font-medium">No cards yet</p>
          <p className="mt-2 text-ink-2">Cards appear when you answer an exercise at the end of a lesson. Nothing here is pre-filled.</p>
          <Link href="/learn" className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg hover:bg-signal hover:text-white">Open the dashboard</Link>
        </div>
      ) : due.length > 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="font-display text-4xl">{due.length} {due.length === 1 ? "card" : "cards"} due</p>
          <p className="mt-2 text-ink-2">{known} {known === 1 ? "card" : "cards"} in your deck. Sessions are capped at 20 so they stay short.</p>
          <button type="button" onClick={() => setSession({ queue: due.map(cardKey), total: due.length, done: 0, missed: 0, retried: new Set() })}
            className="mt-5 inline-flex h-11 items-center rounded-full bg-ink px-6 font-medium text-bg hover:bg-signal hover:text-white">Start review</button>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="font-display text-4xl">Nothing due</p>
          <p className="mt-2 text-ink-2">{known} {known === 1 ? "card" : "cards"} in your deck.{next !== null && <> The next one is due {describeIn(next - now)}.</>}</p>
        </div>
      )}

      {weak.length > 0 && (
        <section className="mt-12" aria-labelledby="weak-h">
          <h2 id="weak-h" className="font-display text-3xl">Where you struggle</h2>
          <p className="mt-2 text-sm text-ink-2">Lessons ranked by cards you missed first try, failed in review, or that keep returning soon. Concepts are the lesson&rsquo;s, not per question.</p>
          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
            {weak.slice(0, 6).map((w) => (
              <li key={`${w.chapter}/${w.lesson}`} className="p-4">
                <Link href={lessonLink(w)} className="u-link font-medium">{w.title}</Link>
                <span className="ml-2 text-sm text-ink-3">{w.struggling} of {w.cards} {w.cards === 1 ? "card" : "cards"}</span>
                <p className="mt-1 text-sm text-ink-2">{w.concepts.join(" · ")}</p>
              </li>))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CardView({ card, s, practice, onGrade }: { card: Card; s: Session; practice: boolean; onGrade: (g: Grade) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const right = checked && pick === card.answer;
  return (
    <section aria-labelledby="rc-q" className="rounded-2xl border border-line bg-surface p-5 md:p-6">
      <p className="eyebrow flex justify-between"><span>{card.lessonTitle}{practice && " · practice"}</span><span>{s.done + 1} / {s.total}</span></p>
      <p id="rc-q" className="mt-3 text-[1.05rem] font-medium leading-snug">{card.prompt}</p>
      <div role="radiogroup" aria-labelledby="rc-q" className="mt-4 grid gap-2">
        {card.options.map((o, i) => {
          const isAns = i === card.answer, isPick = pick === i;
          return (
            <button key={i} type="button" role="radio" aria-checked={isPick} disabled={checked} onClick={() => setPick(i)}
              className={clsx("flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[0.95rem] leading-snug transition-colors",
                checked && isAns ? "border-ok bg-ok/10" : checked && isPick ? "border-warn bg-warn/10" : isPick ? "border-ink bg-bg-2" : "border-line hover:border-line-strong")}>
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[0.65rem]">{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{o}</span>
              {checked && isAns && <Check size={16} className="mt-0.5 text-ok" />}
              {checked && isPick && !isAns && <X size={16} className="mt-0.5 text-warn" />}
            </button>);
        })}
      </div>
      {!checked ? (
        <button type="button" disabled={pick === null} onClick={() => setChecked(true)} className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-40">Check answer</button>
      ) : (
        <div role="status" aria-live="polite" className="mt-5 border-t border-line pt-4">
          <p className={right ? "font-medium text-ok" : "font-medium text-warn"}>{right ? "Correct." : practice ? "Not yet. Read the explanation." : "Not this time. It will come back tomorrow."}</p>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2"><span className="font-medium text-ink">Why: </span>{card.explain}</p>
          {practice ? (
            <button type="button" onClick={() => onGrade(4)} className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg hover:bg-signal hover:text-white">Next</button>
          ) : right ? (
            <div className="mt-4"><p className="text-sm text-ink-2">How did that feel?</p>
              <div className="mt-2 flex flex-wrap gap-2">{GRADES.map((g) => <button key={g.g} type="button" onClick={() => onGrade(g.g)} className="rounded-full border border-line-strong px-4 py-2 text-sm hover:border-ink"><span className="font-medium">{g.label}</span><span className="ml-2 text-ink-3">{g.hint}</span></button>)}</div></div>
          ) : (
            <button type="button" onClick={() => onGrade(1)} className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg hover:bg-signal hover:text-white">Next</button>
          )}
        </div>
      )}
    </section>
  );
}

function Summary({ s, onDone }: { s: Session; onDone: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <p className="font-display text-4xl">Session done</p>
      <p className="mt-2 text-ink-2">{s.total} {s.total === 1 ? "card" : "cards"} reviewed{s.missed > 0 ? `, ${s.missed} missed answer${s.missed === 1 ? "" : "s"} (asked again once, then scheduled for tomorrow)` : ", none missed"}.</p>
      <button type="button" onClick={onDone} className="mt-5 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg hover:bg-signal hover:text-white">Back to your deck</button>
    </div>
  );
}
