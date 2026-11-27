"use client";
import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import { LABS } from "@/data/curriculum";
import { SectionHead } from "../motion";
import { DnsSim } from "../sim/DnsSim";
import { EventLoopSim } from "../sim/EventLoopSim";
import { isLiveLab } from "@/data/labs";

export function Labs() {
  const [tab, setTab] = useState<"dns" | "event-loop">("dns");
  return (
    <section id="labs" data-hop="04" className="border-y border-line bg-bg-2/60">
      <div className="mx-auto max-w-[88rem] px-5 py-28 md:px-8 md:py-36">
        <SectionHead index="04" eyebrow="Interactive laboratories" title={<>Don&rsquo;t read about it. <em className="text-signal-ink">Watch it run.</em></>}>
          Every flagship concept gets a lab you can pause, step through and bend. Change a parameter and the whole timeline is recomputed. Two are live here; each has its own page with a shareable link.
        </SectionHead>
        <div role="tablist" aria-label="Lab preview" className="mt-12 flex gap-2">
          {([["dns", "DNS resolution"], ["event-loop", "Node.js event loop"]] as const).map(([id, name]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={clsx("rounded-full border px-4 py-1.5 text-sm transition-colors", tab === id ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}>{name}</button>
          ))}
        </div>
        <div className="mt-5" role="tabpanel">{tab === "dns" ? <DnsSim embedded /> : <EventLoopSim embedded />}</div>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {LABS.map((l) => (
            <li key={l.id} className="bg-surface p-5">
              <div className="flex items-center justify-between font-mono text-xs"><span className="text-signal-ink">{l.chapter}</span>{isLiveLab(l.id) ? <Link href={`/labs/${l.id}`} className="u-link text-signal-ink">open lab</Link> : <span className="text-ink-3">planned</span>}</div>
              <h3 className="mt-3 font-display text-2xl">{l.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{l.blurb}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6"><Link href="/labs" className="u-link text-sm font-medium">See all labs</Link></p>
      </div>
    </section>
  );
}
