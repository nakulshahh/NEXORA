"use client";
import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Reveal, SplitReveal } from "../motion";
import { HeroHttp } from "../viz/HeroHttp";

export function Hero() {
  return (
    <section id="top" data-hop="00" className="relative">
      <div className="mx-auto max-w-[88rem] px-5 pb-20 pt-10 md:px-8 md:pt-16">
        <Reveal className="flex items-center gap-3" y={8}>
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-60" style={{ animation: "ping-ring 1.8s ease-out infinite" }} /><span className="relative h-2 w-2 rounded-full bg-signal" /></span>
          <span className="eyebrow">Interactive backend engineering academy</span>
        </Reveal>

        <h1 className="font-display mt-7 text-[clamp(2.9rem,7.4vw,7.2rem)] leading-[0.95] tracking-[-0.025em]">
          <SplitReveal text="Understand Backend Engineering." delay={0.1} />
          <br />
          <SplitReveal text="Beyond Frameworks." delay={0.5} accentClass="italic text-signal-ink" accentFrom={0} />
        </h1>

        <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <Reveal delay={0.9}>
            <p className="max-w-xl text-xl leading-relaxed text-ink-2">
              Stop memorizing frameworks. Understand the systems, protocols and machinery that make them work.
            </p>
          </Reveal>
          <Reveal delay={1.0} className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/learn/foundations/0.2" className="group inline-flex h-12 items-center gap-3 rounded-full bg-ink pl-6 pr-2 text-[0.95rem] font-medium text-bg transition hover:bg-signal hover:text-white">
              Start with the network
              <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-ink transition group-hover:translate-x-0.5"><ArrowRight size={15} /></span>
            </Link>
            <Link href="/roadmap" className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-[0.95rem] transition hover:border-ink">Explore the roadmap</Link>
          </Reveal>
        </div>

        <Reveal delay={1.15} y={40} className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <p className="max-w-md text-sm text-ink-2"><span className="font-mono text-ink">GET /users/42</span>: one request, every layer it touches. Toggle the caches and watch the milliseconds move.</p>
            <a href="#problem" className="hidden items-center gap-2 font-mono text-xs text-ink-2 hover:text-ink sm:inline-flex">scroll <ArrowDown size={12} /></a>
          </div>
          <HeroHttp />
        </Reveal>
      </div>
    </section>
  );
}
