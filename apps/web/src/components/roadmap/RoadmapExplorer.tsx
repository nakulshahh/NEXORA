"use client";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, FlaskConical, Lock, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ALL_CHAPTERS, CHAPTER_BY_ID, PARTS, TIER_LABEL, dependents, transitivePrereqs, type Chapter, type Tier } from "@/data/curriculum";
import { chapterState, toggleKnown, useProgress, type ChapterState } from "@/lib/progress";
import { chapterHref } from "@/lib/routes";
import { lessonsOf } from "@/data/lessons";
import { EASE } from "../motion";

type Rel = "self" | "prereq" | "dependent" | "none";
const TIERS: ("all" | Tier)[] = ["all", 1, 2, 3];

function StateDot({ s, size = 14 }: { s: ChapterState; size?: number }) {
  const base = "grid shrink-0 place-items-center rounded-full border-2 bg-bg";
  const st = { width: size, height: size };
  if (s === "completed") return <span className={clsx(base, "border-ok bg-ok text-white")} style={st}><Check size={size - 6} strokeWidth={4} /></span>;
  if (s === "known") return <span className={clsx(base, "border-ok text-ok")} style={st}><Check size={size - 6} strokeWidth={4} /></span>;
  if (s === "ready") return <span className={clsx(base, "border-signal")} style={st}><i className="h-1.5 w-1.5 rounded-full bg-signal" /></span>;
  return <span className={clsx(base, "border-line-strong text-ink-3")} style={st}><Lock size={size - 8} /></span>;
}
const STATE_LABEL: Record<ChapterState, string> = { completed: "Completed", known: "Marked as known", ready: "Ready to start", locked: "Needs prerequisites" };

export function RoadmapExplorer() {
  const progress = useProgress();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | Tier>("all");
  const [sliceOnly, setSliceOnly] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [activePart, setActivePart] = useState(PARTS[0]!.id);
  const searchRef = useRef<HTMLInputElement>(null);

  const rel = useMemo(() => {
    const m = new Map<string, Rel>();
    if (!sel) return m;
    transitivePrereqs(sel).forEach((x) => m.set(x, "prereq"));
    dependents(sel).forEach((x) => m.set(x, "dependent"));
    m.set(sel, "self");
    return m;
  }, [sel]);

  const match = (c: Chapter) => {
    if (tier !== "all" && c.tier !== tier) return false;
    if (sliceOnly && !c.slice) return false;
    const t = q.trim().toLowerCase();
    return !t || `${c.id} ${c.title} ${c.summary} ${c.sim ?? ""}`.toLowerCase().includes(t);
  };
  const shown = ALL_CHAPTERS.filter(match);

  useEffect(() => {
    const els = PARTS.map((p) => document.getElementById(`part-${p.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActivePart(v.target.id.replace("part-", "")); }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [shown.length]);

  const goPart = (id: string) => document.getElementById(`part-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const selChapter = sel ? CHAPTER_BY_ID.get(sel)! : null;

  return (
    <div>
      {/* Controls */}
      <div className="sticky top-14 z-30 -mx-5 border-b border-line bg-bg/95 px-5 py-3 backdrop-blur-[2px] md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1 sm:max-w-sm">
            <span className="sr-only">Filter chapters</span>
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: cache, DNS, B-tree…" className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-sm outline-none transition focus:border-ink" />
            {q && <button type="button" aria-label="Clear filter" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full hover:bg-bg-2"><X size={13} /></button>}
          </label>
          <div role="group" aria-label="Tier" className="flex gap-1 rounded-full border border-line p-1">
            {TIERS.map((t) => (
              <button key={String(t)} type="button" aria-pressed={tier === t} onClick={() => setTier(t)} className={clsx("rounded-full px-3 py-1 text-xs transition-colors", tier === t ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}>
                {t === "all" ? "All tiers" : TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={sliceOnly} onClick={() => setSliceOnly((v) => !v)} className={clsx("h-10 rounded-full border px-4 text-xs transition-colors", sliceOnly ? "border-signal bg-signal-wash text-signal-ink" : "border-line text-ink-2 hover:border-line-strong")}>First slice only</button>
          <span className="ml-auto font-mono text-xs text-ink-2 tnum" aria-live="polite">{shown.length} of {ALL_CHAPTERS.length}</span>
        </div>
        {/* Mobile part chips */}
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 lg:hidden" aria-label="Jump to part">
          {PARTS.map((p) => (<button key={p.id} type="button" onClick={() => goPart(p.id)} className={clsx("shrink-0 rounded-full border px-3 py-1 text-xs", activePart === p.id ? "border-ink bg-ink text-bg" : "border-line text-ink-2")}>{p.id} · {p.title}</button>))}
        </div>
      </div>

      <div className="grid gap-10 pt-8 lg:grid-cols-[13rem_1fr] xl:grid-cols-[13rem_1fr_23rem]">
        {/* Part navigator */}
        <nav aria-label="Parts" className="hidden lg:block">
          <ul className="sticky top-40 space-y-1">
            {PARTS.map((p) => {
              const done = p.chapters.filter((c) => progress.known.includes(c.id) || progress.completed.includes(c.id)).length;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => goPart(p.id)} aria-current={activePart === p.id ? "true" : undefined} className={clsx("group relative flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", activePart === p.id ? "text-ink" : "text-ink-2 hover:text-ink")}>
                    {activePart === p.id && <motion.span layoutId="part-pill" className="absolute inset-0 -z-10 rounded-lg bg-bg-2" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                    <span className="w-4 font-mono text-xs text-signal-ink">{p.id}</span><span className="flex-1">{p.title}</span><span className="font-mono text-[0.68rem] text-ink-3 tnum">{done}/{p.chapters.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Chapter list */}
        <div className="min-w-0">
          {shown.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-display text-3xl">Nothing matches.</p>
              <p className="mt-2 text-sm text-ink-2">Try a broader term, or clear the filters.</p>
              <button type="button" onClick={() => { setQ(""); setTier("all"); setSliceOnly(false); }} className="mt-5 rounded-full border border-line-strong px-4 py-1.5 text-sm hover:border-ink">Reset filters</button>
            </div>
          )}
          {PARTS.map((p) => {
            const rows = p.chapters.filter(match);
            if (!rows.length) return null;
            return (
              <section key={p.id} id={`part-${p.id}`} aria-labelledby={`h-${p.id}`} className="scroll-mt-44 pb-14">
                <div className="flex items-baseline gap-4"><span className="font-mono text-sm text-signal-ink">{p.id}</span><h2 id={`h-${p.id}`} className="font-display text-4xl md:text-5xl">{p.title}</h2></div>
                <p className="ml-0 mt-2 max-w-lg text-ink-2 md:ml-8">{p.blurb}</p>
                <ol className="relative mt-6 md:ml-8">
                  <span aria-hidden="true" className="absolute bottom-3 left-[6.5px] top-3 w-px bg-line-strong" />
                  {rows.map((c) => {
                    const s = chapterState(c.id, progress, c.prereqs);
                    const r: Rel = sel ? rel.get(c.id) ?? "none" : "none";
                    const missing = c.prereqs.filter((x) => !(progress.known.includes(x) || progress.completed.includes(x)));
                    return (
                      <li key={c.id} className="relative">
                        <button type="button" aria-pressed={sel === c.id} onClick={() => setSel(sel === c.id ? null : c.id)}
                          className={clsx("group relative grid w-full grid-cols-[1.75rem_1fr] gap-x-3 rounded-xl py-3 pr-3 text-left transition-[opacity,background-color] duration-300 sm:grid-cols-[1.75rem_3rem_1fr_auto]", sel === c.id ? "bg-surface ring-1 ring-signal" : "hover:bg-surface", sel && r === "none" && "opacity-45")}>
                          <span className="relative z-10 pt-0.5"><StateDot s={s} /></span>
                          <span className="hidden pt-0.5 font-mono text-xs text-ink-3 sm:block">{c.id}</span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-baseline gap-x-3"><span className="text-[1.02rem] font-medium">{c.title}</span>
                              {r === "prereq" && <span className="font-mono text-[0.65rem] text-trace">PREREQUISITE</span>}
                              {r === "dependent" && <span className="font-mono text-[0.65rem] text-signal-ink">UNLOCKS</span>}
                            </span>
                            <span className="mt-0.5 block text-sm text-ink-2">{c.summary}</span>
                            <span className="mt-2 flex flex-wrap items-center gap-2 text-[0.7rem]">
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-ink-2"><i className={clsx("h-1.5 w-1.5 rounded-full", c.tier === 1 ? "bg-signal" : c.tier === 2 ? "bg-trace" : "bg-line-strong")} />{TIER_LABEL[c.tier]}</span>
                              {c.sim && <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-ink-2"><FlaskConical size={11} />{c.sim}</span>}
                              {lessonsOf(c.id).length > 0 && <span className="rounded-full bg-signal-wash px-2 py-0.5 text-signal-ink">{lessonsOf(c.id).length} lessons</span>}
                              {c.slice && <span className="rounded-full bg-signal-wash px-2 py-0.5 font-mono text-signal-ink">first slice</span>}
                              {s === "locked" && <span className="text-ink-3">needs {missing.slice(0, 3).join(", ")}{missing.length > 3 ? "…" : ""}</span>}
                            </span>
                          </span>
                          <span className="hidden self-center font-mono text-[0.68rem] text-ink-3 sm:block">{c.prereqs.length ? `${c.prereqs.length} prereq` : "no prereqs"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>

        {/* Detail — desktop column */}
        <aside className="hidden xl:block" aria-label="Chapter details">
          <div className="sticky top-40"><Detail chapter={selChapter} onSelect={setSel} onClose={() => setSel(null)} /></div>
        </aside>
      </div>

      {/* Detail — bottom sheet below xl */}
      <AnimatePresence>
        {selChapter && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.45, ease: EASE }}
            className="fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-3xl border-t border-line-strong bg-bg p-5 shadow-[0_-20px_60px_-30px_rgba(0,0,0,0.4)] xl:hidden" role="dialog" aria-label={`${selChapter.title} details`}>
            <Detail chapter={selChapter} onSelect={setSel} onClose={() => setSel(null)} sheet />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Detail({ chapter, onSelect, onClose, sheet }: { chapter: (typeof ALL_CHAPTERS)[number] | null | undefined; onSelect: (id: string) => void; onClose: () => void; sheet?: boolean }) {
  const progress = useProgress();
  if (!chapter) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-ink-2">
        <p className="font-display text-2xl text-ink">Pick a chapter.</p>
        <p className="mt-2">Its prerequisites and everything it unlocks light up on the road. Chapters you mark as known unlock their dependents.</p>
      </div>
    );
  }
  const full = CHAPTER_BY_ID.get(chapter.id)!;
  const pre = transitivePrereqs(chapter.id);
  const next = dependents(chapter.id);
  const s = chapterState(chapter.id, progress, full.prereqs);
  const known = progress.known.includes(chapter.id);
  const Chip = ({ id }: { id: string }) => {
    const c = CHAPTER_BY_ID.get(id)!; const st = chapterState(id, progress, c.prereqs);
    return <button type="button" onClick={() => onSelect(id)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs hover:border-ink"><StateDot s={st} size={12} /><span className="font-mono">{id}</span><span className="max-w-[9rem] truncate text-ink-2">{c.title}</span></button>;
  };
  return (
    <motion.div key={chapter.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className={clsx("rounded-2xl border border-line bg-surface p-6", sheet && "border-0 bg-transparent p-0")}>
      <div className="flex items-start justify-between gap-3"><span className="eyebrow">{chapter.partTitle} · {chapter.id}</span><button type="button" onClick={onClose} aria-label="Close details" className="grid h-7 w-7 place-items-center rounded-full border border-line"><X size={13} /></button></div>
      <h3 className="mt-3 font-display text-4xl leading-[1.05]">{chapter.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{chapter.summary}</p>
      <div className="mt-4 flex items-center gap-2 text-sm"><StateDot s={s} /><span>{STATE_LABEL[s]}</span></div>

      <div className="mt-6"><h4 className="eyebrow">Before this ({pre.length})</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">{pre.length ? pre.map((id) => <Chip key={id} id={id} />) : <span className="text-sm text-ink-2">Nothing. You can start here.</span>}</div></div>
      <div className="mt-5"><h4 className="eyebrow">Unlocks ({next.length})</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">{next.length ? next.map((id) => <Chip key={id} id={id} />) : <span className="text-sm text-ink-2">A leaf. Nothing depends on it yet.</span>}</div></div>
      {chapter.sim && <div className="mt-5 flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2.5 text-sm"><FlaskConical size={14} className="text-signal-ink" /><span><span className="text-ink-2">Planned lab:</span> {chapter.sim}</span></div>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={chapterHref(chapter)} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-bg transition hover:bg-signal hover:text-white">Open chapter <ArrowUpRight size={14} /></Link>
        <button type="button" role="switch" aria-checked={known} onClick={() => toggleKnown(chapter.id)} className={clsx("h-10 rounded-full border px-4 text-sm transition-colors", known ? "border-ok text-ok" : "border-line hover:border-line-strong")}>{known ? "Marked as known ✓" : "I already know this"}</button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">Lessons ship milestone by milestone. “Known” is self-reported and stored only in this browser.</p>
    </motion.div>
  );
}
