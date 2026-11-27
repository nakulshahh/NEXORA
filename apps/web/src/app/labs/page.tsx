import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import { LABS } from "@/data/curriculum";
import { isLiveLab } from "@/data/labs";

export const metadata: Metadata = { title: "Labs", description: "Interactive backend engineering laboratories." };

export default function LabsPage() {
  const live = (id: string) => isLiveLab(id);
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-14 md:px-8 md:pt-20">
      <p className="eyebrow">Interactive laboratories</p>
      <h1 className="font-display mt-4 text-[clamp(3rem,7vw,6rem)] leading-[0.95]">Watch it <em className="text-signal-ink">run.</em></h1>
      <p className="mt-5 max-w-xl text-lg text-ink-2">{LABS.filter((l) => live(l.id)).length} labs are live. Each one is a deterministic model: change a parameter and the whole timeline is recomputed, step through it, and share the exact state as a link. Each also says what it simplifies.</p>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LABS.map((l) => (
          <li key={l.id}>
            {live(l.id) ? (
              <Link href={`/labs/${l.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-signal">
                <div className="flex items-center justify-between font-mono text-xs"><span className="text-signal-ink">Chapter {l.chapter}</span><span className="rounded-full bg-signal-wash px-2 py-0.5 text-signal-ink">live</span></div>
                <FlaskConical size={18} className="mt-6 text-signal-ink" />
                <h2 className="mt-2 font-display text-3xl leading-tight">{l.title}</h2>
                <p className="mt-2 flex-1 text-sm text-ink-2">{l.blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">Open the lab <ArrowUpRight size={14} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
              </Link>
            ) : (
              <div className="flex h-full flex-col rounded-2xl border border-dashed border-line-strong p-6">
                <div className="flex items-center justify-between font-mono text-xs"><span className="text-ink-2">Chapter {l.chapter}</span><span className="text-ink-3">planned</span></div>
                <h2 className="mt-6 font-display text-3xl leading-tight text-ink-2">{l.title}</h2>
                <p className="mt-2 text-sm text-ink-3">{l.blurb}</p>
                <p className="mt-4 text-xs text-ink-3">Built when its chapter is authored. <Link href="/roadmap" className="u-link">See the roadmap.</Link></p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
