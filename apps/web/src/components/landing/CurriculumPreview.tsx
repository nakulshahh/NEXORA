"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { ALL_CHAPTERS, LABS, PARTS } from "@/data/curriculum";
import { SectionHead, EASE } from "../motion";

export function CurriculumPreview() {
  const [open, setOpen] = useState("0");
  const slice = ALL_CHAPTERS.filter((c) => c.slice).length;
  return (
    <section id="curriculum" data-hop="03" className="mx-auto max-w-[88rem] px-5 py-28 md:px-8 md:py-36">
      <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <SectionHead index="03" eyebrow="The curriculum" title={<>Seven parts. One road from <em className="text-signal-ink">socket</em> to system design.</>}>
          Prerequisites are explicit, order is deliberate, and nothing is a link to somebody else's blog post.
        </SectionHead>
        <dl className="grid grid-cols-3 gap-8 font-mono">
          {[[ALL_CHAPTERS.length, "chapters"], [LABS.length, "flagship labs"], [slice, "in the first slice"]].map(([n, l]) => (
            <div key={String(l)}><dt className="text-xs text-ink-2">{l}</dt><dd className="font-display text-5xl text-ink">{n}</dd></div>
          ))}
        </dl>
      </div>

      <ul className="mt-14 border-t border-line">
        {PARTS.map((p, idx) => {
          const on = open === p.id;
          return (
            <li key={p.id} className="border-b border-line">
              <button type="button" aria-expanded={on} onClick={() => setOpen(on ? "" : p.id)} onMouseEnter={() => matchMedia("(hover:hover)").matches && setOpen(p.id)}
                className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-4 py-5 text-left md:grid-cols-[5rem_1fr_auto_auto] md:py-6">
                <span className="font-mono text-sm text-signal-ink">{p.id}</span>
                <span className={clsx("font-display text-[clamp(1.8rem,4.4vw,3.4rem)] leading-none transition-colors", on ? "text-ink" : "text-ink-2 group-hover:text-ink")}>{p.title}</span>
                <span className="hidden max-w-xs text-sm text-ink-2 md:block">{p.blurb}</span>
                <span className="font-mono text-xs text-ink-2 tnum">{p.chapters.length} ch</span>
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="overflow-hidden">
                    <ul className="grid gap-x-8 pb-7 pl-0 sm:grid-cols-2 md:pl-[5rem] lg:grid-cols-3">
                      {p.chapters.map((c, ci) => (
                        <motion.li key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.03, duration: 0.4, ease: EASE }}>
                          <Link href="/roadmap" className="flex items-baseline gap-3 border-t border-line/70 py-2.5 text-sm transition-colors hover:text-signal-ink">
                            <span className="w-8 font-mono text-xs text-ink-3">{c.id}</span>
                            <span className="flex-1">{c.title}</span>
                            <span className={clsx("h-1.5 w-1.5 rounded-full", c.tier === 1 ? "bg-signal" : c.tier === 2 ? "bg-trace" : "bg-line-strong")} title={`Tier ${c.tier}`} />
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="sr-only">Part {idx + 1} of {PARTS.length}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-ink-2">
          <span className="inline-flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-signal" />Core</span>
          <span className="inline-flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-trace" />Extended</span>
          <span className="inline-flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-line-strong" />Advanced</span>
        </p>
        <Link href="/roadmap" className="group inline-flex items-center gap-2 text-sm font-medium">
          <span className="u-link">Open the full roadmap</span><ArrowUpRight size={16} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}
