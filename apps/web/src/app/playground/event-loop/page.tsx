import type { Metadata } from "next";
import { EventLoopPlayground } from "@/components/playground/EventLoopPlayground";

export const metadata: Metadata = { title: "Event-loop playground", description: "Predict a small program's output, then compare with a model of Node's event loop and a real run in your browser." };

export default function Page() {
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <p className="eyebrow">Playground</p>
      <h1 className="font-display mt-4 text-[clamp(2.6rem,6vw,5rem)] leading-[0.95]">Predict, then <em className="text-signal-ink">check.</em></h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">Write a small program, guess the order of its output, and see how your guess, our model of Node and a real run in your browser compare. Where they disagree is where the learning is.</p>
      <div className="mt-8"><EventLoopPlayground /></div>
    </div>
  );
}
