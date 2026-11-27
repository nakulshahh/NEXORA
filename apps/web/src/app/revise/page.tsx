import type { Metadata } from "next";
import { Revise } from "@/components/revise/Revise";

export const metadata: Metadata = { title: "Revise", description: "Spaced-repetition review of the exercises you have answered, scheduled with SM-2." };

export default function RevisePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-14 md:pt-20">
      <p className="eyebrow">Revision</p>
      <h1 className="font-display mt-4 text-[clamp(2.6rem,6vw,4.5rem)] leading-[0.95]">Remember it <em className="text-signal-ink">next month.</em></h1>
      <p className="mt-5 max-w-xl text-lg text-ink-2">Every exercise you answer in a lesson becomes a card. Cards come back on a schedule that stretches as you get them right and tightens when you miss.</p>
      <div className="mt-10"><Revise /></div>
      <div className="h-24" />
    </div>
  );
}
