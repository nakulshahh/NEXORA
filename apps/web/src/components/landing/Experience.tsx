"use client";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, Check, Code2, MessageSquare, Sparkles } from "lucide-react";
import { SectionHead, Reveal, EASE } from "../motion";

const POINTS = [
  { icon: BookOpen, t: "A reading column built for hours", d: "Serif prose at a 68-character measure. Code, diagrams and labs sit inline instead of in another tab." },
  { icon: Sparkles, t: "Labs where the idea happens", d: "A concept appears, you poke a simulation, then you move on. No context switch." },
  { icon: MessageSquare, t: "Ask without leaving", d: "Select a sentence and ask. The answer cites the lesson you are already reading." },
  { icon: Code2, t: "Prove it to yourself", d: "Predict the output, debug a broken handler, defend a trade-off." },
];

export function Experience() {
  const reduce = useReducedMotion();
  return (
    <section id="experience" data-hop="06" className="border-y border-line bg-bg-2/60">
      <div className="mx-auto grid max-w-[88rem] gap-14 px-5 py-28 md:px-8 md:py-36 lg:grid-cols-[0.9fr_1.4fr] lg:items-center">
        <div>
          <SectionHead index="06" eyebrow="The learning experience" title={<>Made for the long session, <em className="text-signal-ink">not the skim.</em></>} />
          <ul className="mt-10 space-y-6">
            {POINTS.map((p, i) => (
              <Reveal as="li" key={p.t} delay={i * 0.06} className="flex gap-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-signal-ink"><p.icon size={16} /></span>
                <div><h3 className="text-[0.98rem] font-medium">{p.t}</h3><p className="mt-1 text-sm leading-relaxed text-ink-2">{p.d}</p></div>
              </Reveal>
            ))}
          </ul>
        </div>

        {/* Lesson-page mock: three panes, composed from real tokens */}
        <Reveal y={40}>
          <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)]" aria-label="Preview of the lesson layout" role="img">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5"><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="ml-3 font-mono text-[0.68rem] text-ink-3">nexora / foundations / 0.2 / dns</span></div>
            <div className="grid min-h-[26rem] grid-cols-[9rem_1fr] md:grid-cols-[10rem_1fr_11rem]">
              <aside className="hidden border-r border-line p-4 sm:block">
                <div className="eyebrow !text-[0.6rem]">0.2 Networking</div>
                <ul className="mt-3 space-y-2 text-xs">
                  {["Names & addresses", "How DNS resolves", "Caching & TTL", "TCP handshake", "TLS"].map((t, k) => (
                    <li key={t} className={`flex items-center gap-2 ${k === 1 ? "text-ink" : "text-ink-3"}`}>
                      <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${k === 0 ? "border-ok bg-ok text-white" : k === 1 ? "border-signal" : "border-line-strong"}`}>{k === 0 && <Check size={8} strokeWidth={4} />}</span>{t}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 h-1 rounded bg-line"><motion.div className="h-full rounded bg-signal" initial={reduce ? false : { width: 0 }} whileInView={{ width: "28%" }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE, delay: 0.4 }} /></div>
              </aside>
              <article className="min-w-0 p-5 md:p-7">
                <div className="eyebrow !text-[0.6rem]">Lesson 0.2.2 · 18 min</div>
                <h3 className="mt-2 font-display text-3xl leading-tight md:text-4xl">How a name becomes an address</h3>
                <div className="mt-3 space-y-1.5" aria-hidden="true">{[100, 94, 62].map((w, k) => <div key={k} className="h-2 rounded bg-bg-2" style={{ width: `${w}%` }} />)}</div>
                <div className="mt-4 rounded-lg border border-signal/60 bg-signal-wash p-3 text-xs"><span className="font-mono text-signal-ink">Lab</span> <span className="text-ink-2">Resolve a name, with and without a warm cache.</span>
                  <div className="relative mt-3 h-1.5 overflow-hidden rounded bg-bg/70"><motion.i className="absolute inset-y-0 w-1/4 rounded bg-signal" animate={reduce ? undefined : { x: ["-100%", "400%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} /></div></div>
                <pre className="code mt-4 overflow-hidden rounded-lg p-3 text-[0.72rem] leading-relaxed"><span className="tok-k">const</span> ip = <span className="tok-k">await</span> <span className="tok-f">resolve</span>(<span className="tok-s">&quot;api.nexora.dev&quot;</span>);{"\n"}<span className="tok-c">{"// walk: root → TLD → authoritative"}</span></pre>
                <div className="mt-3 space-y-1.5" aria-hidden="true">{[96, 70].map((w, k) => <div key={k} className="h-2 rounded bg-bg-2" style={{ width: `${w}%` }} />)}</div>
              </article>
              <aside className="hidden border-l border-line p-4 md:block">
                <div className="flex gap-3 text-[0.68rem]"><span className="border-b border-signal pb-1 text-ink">Ask</span><span className="text-ink-3">Notes</span><span className="text-ink-3">Lab</span></div>
                <div className="mt-4 rounded-lg border border-line p-2.5 text-[0.7rem] text-ink-2">Why is the root server not the one that knows my IP?</div>
                <div className="mt-2 rounded-lg bg-bg-2 p-2.5 text-[0.7rem] text-ink-2">Roots only delegate. <span className="rounded bg-trace-wash px-1 font-mono text-trace">1</span> …</div>
              </aside>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
