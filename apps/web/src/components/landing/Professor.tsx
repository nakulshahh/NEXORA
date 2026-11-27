"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleSlash, FileText } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { SectionHead, EASE } from "../motion";

const PIPE = ["Retrieve", "Rerank", "Confidence gate", "Generate", "Verify citations"];
const SOURCES = [
  { n: 1, ref: "B3 · Indexes & B-trees", text: "A B-tree keeps keys sorted across wide nodes, so a lookup touches a handful of pages." },
  { n: 2, ref: "B1 · Database fundamentals", text: "Databases read in fixed-size pages; every page touched is a potential disk read." },
];

export function Professor() {
  const [covered, setCovered] = useState(true);
  const [hl, setHl] = useState<number | null>(null);
  const reduce = useReducedMotion();
  return (
    <section id="professor" data-hop="05" className="mx-auto max-w-[88rem] px-5 py-28 md:px-8 md:py-36">
      <SectionHead index="05" eyebrow="AI Professor" title={<>An assistant that would <em className="text-signal-ink">rather say &ldquo;I don&rsquo;t know&rdquo;</em> than make something up.</>}>
        Answers come from the curriculum, cite their sources, and are checked by code, not by a promise in a prompt. When the lessons don&rsquo;t cover it, the Professor says so.
      </SectionHead>

      <div className="mt-12 rounded-3xl border border-line bg-surface p-4 md:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="tablist" aria-label="Question type">
            {[[true, "In the curriculum"], [false, "Not covered yet"]].map(([v, l]) => (
              <button key={String(l)} role="tab" aria-selected={covered === v} onClick={() => { setCovered(v as boolean); setHl(null); }}
                className={clsx("rounded-full border px-3.5 py-1 text-sm transition-colors", covered === v ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}>{l as string}</button>
            ))}
          </div>
          <span className="rounded-full border border-dashed border-line-strong px-3 py-1 font-mono text-[0.68rem] text-ink-2">Interface illustration · the Professor ships in M6</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-sm bg-ink px-4 py-3 text-sm text-bg">
              {covered ? "Why does a B-tree make lookups fast?" : "How do I tune Kafka consumer lag at 5 million events a second?"}
            </div>
            <ol className="mt-6 space-y-2">
              {PIPE.map((p, k) => {
                const stopped = !covered && k >= 3;
                return (
                  <motion.li key={`${covered}-${p}`} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.11, duration: 0.5, ease: EASE }}
                    className={clsx("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm", stopped ? "border-line text-ink-3" : "border-line")}>
                    <span className={clsx("grid h-5 w-5 place-items-center rounded-full", stopped ? "bg-bg-2 text-ink-3" : !covered && k === 2 ? "bg-warn text-white" : "bg-ok text-white")}>
                      {stopped ? <CircleSlash size={11} /> : <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="flex-1">{p}</span>
                    <span className="font-mono text-[0.68rem] text-ink-3">{k === 2 ? (covered ? "score 0.91 ≥ 0.60" : "score 0.22 < 0.60") : k === 0 ? "hybrid" : k === 1 ? "top 6" : k === 4 ? "ids ✓ quotes ✓" : ""}</span>
                  </motion.li>
                );
              })}
            </ol>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={String(covered)} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }}>
              {covered ? (
                <>
                  <div className="rounded-2xl rounded-bl-sm border border-line bg-bg p-5 text-[0.98rem] leading-relaxed">
                    A B-tree stores keys in sorted order inside wide nodes, so finding a key means following a few pointers rather than reading every row.
                    <Cite n={1} hl={hl} set={setHl} /> Each node maps to a database page, and fewer pages touched means fewer disk reads.<Cite n={2} hl={hl} set={setHl} />
                    <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">Quick check: if a table has a million rows and each node holds 200 keys, roughly how many levels deep is the tree?</p>
                  </div>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {SOURCES.map((s) => (
                      <li key={s.n} onMouseEnter={() => setHl(s.n)} onMouseLeave={() => setHl(null)} className={clsx("rounded-xl border p-3 text-xs transition-colors", hl === s.n ? "border-signal bg-signal-wash" : "border-line")}>
                        <div className="flex items-center gap-2 font-mono text-signal-ink"><FileText size={12} />[{s.n}] {s.ref}</div>
                        <p className="mt-1.5 text-ink-2">{s.text}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="rounded-2xl rounded-bl-sm border border-dashed border-line-strong bg-bg p-5 text-[0.98rem] leading-relaxed">
                  <p>That isn&rsquo;t covered in the curriculum yet, so I won&rsquo;t guess. The closest lessons are below.</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {["D5 · Message brokers & Kafka", "B7 · Task queues & background jobs"].map((r) => (<li key={r} className="rounded-lg border border-line px-3 py-2 font-mono text-xs text-signal-ink">{r}</li>))}
                  </ul>
                  <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">An answer without a verified source is never shown as if it had one.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function Cite({ n, hl, set }: { n: number; hl: number | null; set: (n: number | null) => void }) {
  return (
    <button type="button" onMouseEnter={() => set(n)} onMouseLeave={() => set(null)} onFocus={() => set(n)} onBlur={() => set(null)} aria-label={`Source ${n}`}
      className={clsx("mx-0.5 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded px-1 align-middle font-mono text-[0.65rem] transition-colors", hl === n ? "bg-signal text-white" : "bg-trace-wash text-trace")}>{n}</button>
  );
}
