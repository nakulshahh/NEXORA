"use client";
import Link from "next/link";
import { motion, useScroll, useSpring, useMotionValueEvent } from "motion/react";
import { ArrowRight, BookOpen, Check, ExternalLink, MessageSquare, NotebookPen, Play, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { lessonStateOf, recordVisit, setScroll, useProgress } from "@/lib/progress";
import { AskPanel } from "./AskPanel";
import { LessonContext } from "./LessonContext";

export interface LessonShellProps {
  chapter: { id: string; title: string; href: string };
  lesson: { slug: string; title: string; order: number; summary: string; minutes: number; objectives: string[]; headings: { id: string; text: string }[]; exercises: string[] };
  siblings: { slug: string; title: string; href: string; exercises: string[] }[];
  prereqs: { id: string; title: string; href: string }[];
  prev: { title: string; href: string } | null;
  next: { title: string; href: string; chapterEnd: boolean } | null;
  watch: { title: string; url: string; channel: string }[];
  reading: { title: string; url: string }[];
  misconceptions: { belief: string; correction: string }[];
  children: React.ReactNode;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LessonShell(p: LessonShellProps) {
  const art = useRef<HTMLElement>(null);
  const companion = useRef<HTMLElement>(null);
  const [active, setActive] = useState("top");
  const [tab, setTab] = useState<"ask" | "notes" | "refs">("ask");
  const [quote, setQuote] = useState<string | null>(null);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const progress = useProgress();
  const L = p.lesson;
  const state = lessonStateOf(progress, p.chapter.id, L.slug);

  const { scrollYProgress } = useScroll({ target: art, offset: ["start 80%", "end 40%"] });
  const bar = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  useMotionValueEvent(scrollYProgress, "change", (v) => { if (v > 0.02) setScroll(p.chapter.id, L.slug, v); });

  useEffect(() => { recordVisit(p.chapter.id); }, [p.chapter.id]);

  // Scrollspy over the H2s (plus the lesson top).
  const ids = useMemo(() => L.headings.map((h) => h.id), [L.headings]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-15% 0px -70% 0px" });
    els.forEach((e) => io.observe(e));
    const onTop = () => { if (window.scrollY < 300) setActive("top"); };
    window.addEventListener("scroll", onTop, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onTop); };
  }, [ids]);

  // Selection toolbar: appears over a selection inside the article only.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const read = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() ?? "";
      if (!s || s.isCollapsed || text.length < 8 || !art.current || !s.anchorNode || !art.current.contains(s.anchorNode) || !art.current.contains(s.focusNode)) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      const below = r.top < 90;
      setSel({ text, x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90), y: below ? r.bottom + 10 : r.top - 46 });
    };
    const on = () => { clearTimeout(t); t = setTimeout(read, 120); };
    document.addEventListener("selectionchange", on);
    return () => { document.removeEventListener("selectionchange", on); clearTimeout(t); };
  }, []);

  const ask = useCallback(() => {
    if (!sel) return;
    setQuote(sel.text.slice(0, 500)); setTab("ask"); setSel(null);
    window.getSelection()?.removeAllRanges();
    companion.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
  }, [sel]);

  const answered = L.exercises.filter((id) => state.exercises[id]?.correct).length;
  const idx = Math.max(0, ["top", ...ids].indexOf(active));
  const ctx = useMemo(() => ({ chapter: p.chapter.id, slug: L.slug, exerciseIds: L.exercises, chapterLessons: p.siblings.map((s) => ({ slug: s.slug, exercises: s.exercises })) }), [p.chapter.id, L.slug, L.exercises, p.siblings]);

  return (
    <LessonContext.Provider value={ctx}>
      <motion.div aria-hidden="true" className="fixed inset-x-0 top-14 z-40 h-[2px] origin-left bg-signal" style={{ scaleX: bar }} />
      <div className="mx-auto grid max-w-[88rem] gap-10 px-5 pb-24 pt-10 md:px-8 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem] xl:gap-14">
        <nav aria-label="Lesson outline" className="lg:sticky lg:top-24 lg:self-start">
          <Link href={p.chapter.href} className="eyebrow u-link">← {p.chapter.id} {p.chapter.title}</Link>
          <details className="group mt-4" open>
            <summary className="cursor-pointer list-none font-mono text-xs text-ink-2 lg:hidden">On this page ({idx + 1}/{ids.length + 1})</summary>
            <ol className="relative mt-3 space-y-1 border-l border-line pl-4">
              {[{ id: "top", text: L.title }, ...L.headings].map((h, k) => (
                <li key={h.id} className="relative">
                  {active === h.id && <motion.span layoutId="lesson-mark" className="absolute -left-[17px] top-1.5 h-4 w-0.5 bg-signal" />}
                  <a href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined} className={clsx("block py-1 text-sm leading-snug transition-colors", active === h.id ? "text-ink" : k < idx ? "text-ink-2" : "text-ink-3 hover:text-ink")}>{k === 0 ? "Start" : h.text}</a>
                </li>
              ))}
            </ol>
            <h2 className="eyebrow mt-8">In this chapter</h2>
            <ol className="mt-3 space-y-1.5">
              {p.siblings.map((s, k) => {
                const st = lessonStateOf(progress, p.chapter.id, s.slug);
                const here = s.slug === L.slug;
                return (
                  <li key={s.slug}>
                    <Link href={s.href} aria-current={here ? "page" : undefined} className={clsx("flex items-start gap-2 text-sm leading-snug", here ? "text-ink" : "text-ink-2 hover:text-ink")}>
                      <span className={clsx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[0.6rem]", st.done ? "border-ok bg-ok text-white" : here ? "border-signal text-signal-ink" : "border-line-strong")}>{st.done ? <Check size={9} strokeWidth={4} /> : k + 1}</span>
                      {s.title}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </details>
        </nav>

        <article ref={art} id="top" className="min-w-0 max-w-[46rem]">
          <p className="eyebrow">{p.chapter.id} {p.chapter.title} · Lesson {L.order} of {p.siblings.length} · about {L.minutes} min</p>
          <h1 className="font-display mt-3 text-[clamp(2.6rem,6vw,4.4rem)] leading-[0.98]">{L.title}</h1>
          <p className="mt-5 text-xl leading-relaxed text-ink-2">{L.summary}</p>

          <div className="mt-8 grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
            <div><h2 className="eyebrow">You will be able to</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed">{L.objectives.map((o) => <li key={o} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-signal" />{o}</li>)}</ul></div>
            <div><h2 className="eyebrow">Before you start</h2>
              {p.prereqs.length ? <ul className="mt-3 space-y-2 text-sm">{p.prereqs.map((c) => <li key={c.id}><Link href={c.href} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 hover:border-ink"><span className="font-mono text-xs">{c.id}</span>{c.title}</Link></li>)}</ul> : <p className="mt-3 text-sm text-ink-2">Nothing. Start here.</p>}</div>
          </div>

          {p.children}

          <section aria-labelledby="done-h" className="mt-14 rounded-2xl border border-line-strong bg-surface p-6">
            <h2 id="done-h" className="eyebrow">Lesson status</h2>
            <p className="mt-3 flex items-center gap-2 text-lg font-medium">
              {state.done ? <><span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-white"><Check size={14} strokeWidth={3} /></span>Lesson complete</> : <>{answered} of {L.exercises.length} exercises answered correctly</>}
            </p>
            {!state.done && <p className="mt-1 text-sm text-ink-2">A lesson counts as complete when every exercise above has been answered correctly. Your answers are stored only in this browser.</p>}
            <details className="mt-5 text-sm">
              <summary className="cursor-pointer text-ink-2 hover:text-ink">Beliefs this lesson corrects</summary>
              <ul className="mt-3 space-y-3">{p.misconceptions.map((m) => <li key={m.belief}><p className="text-ink-2 line-through decoration-warn/60">{m.belief}</p><p className="mt-1">{m.correction}</p></li>)}</ul>
            </details>
          </section>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {p.prev ? <Link href={p.prev.href} className="rounded-xl border border-line p-4 hover:border-ink"><span className="eyebrow">Previous</span><p className="mt-1 font-display text-2xl leading-tight">{p.prev.title}</p></Link> : <span />}
            {p.next && <Link href={p.next.href} className="rounded-xl border border-line p-4 text-right hover:border-ink"><span className="eyebrow">{p.next.chapterEnd ? "Next chapter" : "Next lesson"}</span><p className="mt-1 font-display text-2xl leading-tight">{p.next.title}</p></Link>}
          </div>
        </article>

        <aside ref={companion} className="xl:sticky xl:top-24 xl:self-start" aria-label="Companion panel">
          <div className="rounded-2xl border border-line bg-surface">
            <div role="tablist" aria-label="Companion" className="flex border-b border-line px-2">
              {([["ask", "Ask", MessageSquare], ["notes", "Notes", NotebookPen], ["refs", "Sources", BookOpen]] as const).map(([id, l, Icon]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={clsx("relative flex items-center gap-1.5 px-3 py-3 text-sm transition-colors", tab === id ? "text-ink" : "text-ink-2 hover:text-ink")}>
                  <Icon size={14} />{l}{tab === id && <motion.span layoutId="comp-tab" className="absolute inset-x-2 bottom-0 h-0.5 bg-signal" />}
                </button>
              ))}
            </div>
            <div className="p-5 text-sm leading-relaxed" role="tabpanel">
              {tab === "ask" && (<>
                <AskPanel quote={quote} chapter={p.chapter.id} lesson={L.slug} />
              </>)}
              {tab === "notes" && (<><p className="font-medium">Notes</p><p className="mt-2 text-ink-2">Notes are not built yet. Accounts exist now, so notes will be saved to yours when they arrive.</p></>)}
              {tab === "refs" && (<>
                {p.watch.length > 0 && <><p className="font-medium">Watch</p>
                  <ul className="mt-3 space-y-3">{p.watch.map((w) => <li key={w.url}><a href={w.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-ink-2 hover:text-ink"><Play size={13} className="mt-1 shrink-0" /><span><span className="u-link">{w.title}</span><span className="block text-xs text-ink-3">{w.channel} · external video, link only</span></span></a></li>)}</ul></>}
                <p className={clsx("font-medium", p.watch.length > 0 && "mt-6")}>Primary sources</p>
                {p.reading.length ? <ul className="mt-3 space-y-3">{p.reading.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-ink-2 hover:text-ink"><ExternalLink size={13} className="mt-1 shrink-0" /><span className="u-link">{r.title}</span></a></li>)}</ul> : <p className="mt-2 text-ink-2">None listed for this lesson.</p>}
              </>)}
            </div>
          </div>
        </aside>
      </div>

      {sel && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={ask} style={{ left: sel.x, top: sel.y }}
          className="fixed z-50 inline-flex h-9 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg shadow-xl transition hover:bg-signal hover:text-white">
          <Sparkles size={14} />Ask about this<ArrowRight size={13} />
        </button>
      )}
    </LessonContext.Provider>
  );
}
