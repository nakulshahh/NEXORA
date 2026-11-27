import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export const metadata: Metadata = { title: "Playground", description: "Interactive places to build and break backend ideas." };

const ITEMS = [
  { href: "/playground/architecture", t: "Architecture builder", d: "Drag components, connect them, send requests, take things down. See where latency and failures come from." },
  { href: "/playground/event-loop", t: "Event-loop playground", d: "Write a small program, predict its output, then compare your prediction with the Node model and a real run in your browser." },
];

export default function PlaygroundIndex() {
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-14 md:px-8 md:pt-20">
      <p className="eyebrow">Playground</p>
      <h1 className="font-display mt-4 text-[clamp(3rem,7vw,6rem)] leading-[0.95]">Try it, <em className="text-signal-ink">break it.</em></h1>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {ITEMS.map((i) => (
          <li key={i.href}><Link href={i.href} className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-signal">
            <h2 className="font-display text-3xl leading-tight">{i.t}</h2><p className="mt-2 flex-1 text-sm text-ink-2">{i.d}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium">Open <ArrowUpRight size={14} /></span></Link></li>))}
      </ul>
    </div>
  );
}
