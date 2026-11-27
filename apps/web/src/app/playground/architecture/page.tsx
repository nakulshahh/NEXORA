import type { Metadata } from "next";
import { ArchBuilder } from "@/components/arch/ArchBuilder";

export const metadata: Metadata = { title: "Architecture builder", description: "Drag components, connect them, send requests, break things, and see where latency and failures come from." };

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <p className="eyebrow">Playground</p>
      <h1 className="font-display mt-4 text-[clamp(2.6rem,6vw,5rem)] leading-[0.95]">Build it, then <em className="text-signal-ink">break it.</em></h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">Connect components, send a request through them, take one down, and watch what survives. It is a simplified model, and the rules are listed under the canvas.</p>
      <div className="mt-8"><ArchBuilder /></div>
    </div>
  );
}
