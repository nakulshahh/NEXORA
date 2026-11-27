import type { Metadata } from "next";
import { RoadmapExplorer } from "@/components/roadmap/RoadmapExplorer";
import { ALL_CHAPTERS, PARTS } from "@/data/curriculum";

export const metadata: Metadata = { title: "Roadmap", description: "The complete NEXORA curriculum: parts, chapters, tiers and prerequisites." };

export default function RoadmapPage() {
  const core = ALL_CHAPTERS.filter((c) => c.tier === 1).length;
  return (
    <div className="mx-auto max-w-[88rem] px-5 pt-14 md:px-8 md:pt-20">
      <p className="eyebrow">Curriculum</p>
      <h1 className="font-display mt-4 text-[clamp(3rem,7vw,6rem)] leading-[0.95]">The road, <em className="text-signal-ink">end to end.</em></h1>
      <p className="mt-5 max-w-xl text-lg text-ink-2">{ALL_CHAPTERS.length} chapters across {PARTS.length} parts. {core} are core. Select any chapter to see what must come before it and what it unlocks.</p>
      <div className="mt-10"><RoadmapExplorer /></div>
      <div className="h-24" />
    </div>
  );
}
