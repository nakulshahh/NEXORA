"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Flame, FlaskConical, Repeat2 } from "lucide-react";
import { useMemo } from "react";
import { clsx } from "clsx";
import { ALL_CHAPTERS, CHAPTER_BY_ID, LABS, PARTS, SLICE } from "@/data/curriculum";
import { chapterState, dayKey, lessonStateOf, lessonsDone, streakOf, useProgress } from "@/lib/progress";
import { isLiveLab } from "@/data/labs";
import { LESSONS, lessonHref, lessonsOf } from "@/data/lessons";
import { chapterHref } from "@/lib/routes";
import { EASE } from "../motion";

const card = "rounded-2xl border border-line bg-surface p-6";
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function Dashboard() {
  const p = useProgress();
  const reduce = useReducedMotion();
  const done = new Set([...p.known, ...p.completed]);
  const total = ALL_CHAPTERS.length;
  const pct = done.size / total;
  const sliceDone = SLICE.filter((c) => done.has(c.id)).length;
  const next = useMemo(() => {
    const ready = ALL_CHAPTERS.filter((c) => chapterState(c.id, p, c.prereqs) === "ready");
    return ready.find((c) => c.slice) ?? ready[0] ?? null;
  }, [p]);
  const current = p.last ? CHAPTER_BY_ID.get(p.last) ?? null : null;
  const resume = useMemo(() => {
    if (!current) return null;
    const ls = lessonsOf(current.id); if (!ls.length) return null;
    const open = ls.find((l) => !lessonStateOf(p, current.id, l.slug).done) ?? ls[0]!;
    return { href: lessonHref(current.partSlug, current.id, open.slug), title: open.title, finished: ls.every((l) => lessonStateOf(p, current.id, l.slug).done) };
  }, [p, current]);
  const { days, streak } = useMemo(() => streakOf(p.events), [p.events]);

  // 12-week grid, columns = weeks, rows = Mon..Sun, ending this week
  const cells = useMemo(() => {
    const out: { key: string; on: boolean; future: boolean }[] = [];
    const today = new Date(); const dow = (today.getDay() + 6) % 7;
    for (let w = 11; w >= 0; w--) for (let d = 0; d < 7; d++) {
      const off = w * 7 + (dow - d);
      const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() - off).getTime();
      out.push({ key: dayKey(t), on: days.has(dayKey(t)), future: off < 0 });
    }
    return out;
  }, [days]);

  const fade = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 18 } as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay: 0.08 * i, ease: EASE } });
  const R = 54, C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <motion.div {...fade(0)}>
        <p className="eyebrow">Workspace</p>
        <h1 className="font-display mt-3 text-[clamp(2.8rem,6vw,5rem)] leading-none">Your workspace.</h1>
        <p className="mt-3 max-w-xl text-ink-2">Everything here is read from your curriculum and your saved progress. Nothing is estimated. Signed-out progress lives in this browser; sign in to keep it in your account.</p>
      </motion.div>

      <div className="mt-10 grid gap-4 lg:grid-cols-12">
        {/* Continue + current */}
        <motion.section {...fade(1)} className={clsx(card, "lg:col-span-7")} aria-labelledby="continue-h">
          <h2 id="continue-h" className="eyebrow">Continue learning</h2>
          {current ? (
            <>
              <p className="mt-5 font-mono text-xs text-signal-ink">{current.id} · {PARTS.find((x) => x.chapters.some((c) => c.id === current.id))!.title}</p>
              <p className="mt-1 font-display text-4xl leading-tight md:text-5xl">{current.title}</p>
              <p className="mt-3 max-w-lg text-sm text-ink-2">{current.summary}</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href={resume && !resume.finished ? resume.href : chapterHref(current)} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-bg transition hover:bg-signal hover:text-white">{resume && !resume.finished ? `Resume: ${resume.title}` : "Open chapter"} <ArrowUpRight size={15} /></Link>
                {resume && !resume.finished && <Link href={chapterHref(current)} className="u-link text-sm">Chapter overview</Link>}
                {resume?.finished && <span className="text-sm text-ok">All lessons complete</span>}
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-line-strong p-6">
              <p className="font-display text-3xl">No chapter in progress.</p>
              <p className="mt-2 text-sm text-ink-2">Open any chapter and it appears here. Chapters 0.2 and A1 have full lessons; the rest are outlines until later milestones.</p>
            </div>
          )}
        </motion.section>

        <motion.section {...fade(2)} className={clsx(card, "lg:col-span-5")} aria-labelledby="next-h">
          <h2 id="next-h" className="eyebrow">Recommended next</h2>
          {next ? (
            <>
              <p className="mt-5 font-mono text-xs text-signal-ink">{next.id}{next.slice ? " · first slice" : ""}</p>
              <p className="mt-1 font-display text-3xl leading-tight">{next.title}</p>
              <p className="mt-3 text-sm text-ink-2">Chosen from the prerequisite graph: {next.prereqs.length ? `you have covered ${next.prereqs.join(", ")}` : "it has no prerequisites"}, and it is the earliest core chapter still open.</p>
              <Link href={chapterHref(next)} className="u-link mt-5 inline-flex items-center gap-1.5 text-sm font-medium">View chapter <ArrowUpRight size={14} /></Link>
            </>
          ) : <p className="mt-5 text-sm text-ink-2">Every chapter is covered or waiting on prerequisites.</p>}
        </motion.section>

        {/* Progress */}
        <motion.section {...fade(3)} className={clsx(card, "lg:col-span-4")} aria-labelledby="prog-h">
          <h2 id="prog-h" className="eyebrow">Overall progress</h2>
          <div className="mt-5 flex items-center gap-6">
            <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90" role="img" aria-label={`${done.size} of ${total} chapters covered`}>
              <circle cx="64" cy="64" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
              <motion.circle cx="64" cy="64" r={R} fill="none" stroke="var(--signal)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: reduce ? 0 : 1.4, ease: EASE, delay: 0.3 }} />
            </svg>
            <div><p className="font-display text-6xl leading-none tnum">{done.size}<span className="text-2xl text-ink-3"> / {total}</span></p><p className="mt-2 text-sm text-ink-2">chapters covered</p></div>
          </div>
          <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-ink-2">First slice</dt><dd className="font-mono tnum">{sliceDone} / {SLICE.length}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Lessons completed <span className="text-ink-3">(authored)</span></dt><dd className="font-mono tnum">{lessonsDone(p)} / {LESSONS.length}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Marked as known</dt><dd className="font-mono tnum">{p.known.length}</dd></div>
          </dl>
        </motion.section>

        {/* Streak */}
        <motion.section {...fade(4)} className={clsx(card, "lg:col-span-4")} aria-labelledby="streak-h">
          <h2 id="streak-h" className="eyebrow">Learning streak</h2>
          <div className="mt-5 flex items-end gap-3"><Flame size={28} className={streak ? "text-signal" : "text-line-strong"} /><p className="font-display text-6xl leading-none tnum">{streak}</p><p className="pb-1 text-sm text-ink-2">{streak === 1 ? "day" : "days"} in a row</p></div>
          <div className="mt-6 grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label={`Activity over the last 12 weeks: ${days.size} active days`}>
            {cells.map((c) => <i key={c.key} title={c.key} className={clsx("aspect-square rounded-[3px]", c.future ? "opacity-0" : c.on ? "bg-signal" : "bg-bg-2")} />)}
          </div>
          <p className="mt-4 text-xs text-ink-3">A day counts when you open a chapter or update what you know. Last 12 weeks.</p>
        </motion.section>

        {/* Recent activity */}
        <motion.section {...fade(5)} className={clsx(card, "lg:col-span-4")} aria-labelledby="act-h">
          <h2 id="act-h" className="eyebrow">Recent activity</h2>
          {p.events.length ? (
            <ul className="mt-4 divide-y divide-line">
              {[...p.events].reverse().slice(0, 6).map((e, i) => (
                <li key={`${e.t}-${i}`} className="flex items-baseline gap-3 py-2.5 text-sm">
                  <span className="w-9 shrink-0 font-mono text-xs text-signal-ink">{e.chapter}</span>
                  <span className="flex-1 truncate">{e.kind === "visit" ? "Opened" : e.kind === "known" ? "Marked known:" : e.kind === "lesson" ? "Completed a lesson in" : "Unmarked:"} {CHAPTER_BY_ID.get(e.chapter)?.title}</span>
                  <span className="shrink-0 text-xs text-ink-3">{ago(e.t)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-5 rounded-xl border border-dashed border-line-strong p-5 text-sm text-ink-2">Nothing yet. Opening a chapter or marking one as known shows up here.</p>}
        </motion.section>

        {/* Labs */}
        <motion.section {...fade(6)} className={clsx(card, "lg:col-span-7")} aria-labelledby="labs-h">
          <div className="flex items-baseline justify-between"><h2 id="labs-h" className="eyebrow">Labs</h2><Link href="/labs" className="u-link text-sm">All labs</Link></div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {LABS.slice(0, 3).map((l) => (
              <li key={l.id}><Link href={isLiveLab(l.id) ? `/labs/${l.id}` : "/labs"} className="group block h-full rounded-xl border border-line p-4 transition hover:border-signal">
                <FlaskConical size={16} className="text-signal-ink" /><p className="mt-3 font-display text-2xl leading-tight">{l.title}</p><p className="mt-1 text-xs text-ink-2">{isLiveLab(l.id) ? "Live lab" : "Planned"} · {l.chapter}</p>
              </Link></li>
            ))}
          </ul>
        </motion.section>

        {/* Revision */}
        <motion.section {...fade(7)} className={clsx(card, "lg:col-span-5")} aria-labelledby="rev-h">
          <h2 id="rev-h" className="eyebrow">Revision</h2>
          <div className="mt-4 flex gap-4 rounded-xl border border-dashed border-line-strong p-5">
            <Repeat2 size={20} className="mt-0.5 shrink-0 text-ink-3" />
            <div><p className="text-sm font-medium">Spaced repetition is not built yet.</p><p className="mt-1 text-sm text-ink-2">It arrives in Milestone 7. Cards will be generated from the knowledge checks you complete, so this stays empty until both exist.</p></div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
