import type { Metadata } from "next";
import Link from "next/link";
import { chapterHref } from "@/lib/routes";
import { ConcurrencyArena } from "@/components/concurrency/ConcurrencyArena";

export const metadata: Metadata = { title: "Concurrency Arena", description: "Choose the order threads run in. Watch races, lost updates, deadlocks and producer-consumer bugs happen, then fix them with locks, atomics and semaphores." };
export default function Page() {
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-2"><Link href="/labs" className="u-link">Labs</Link> / <span className="text-ink">Concurrency Arena</span></nav>
      <h1 className="font-display mt-5 text-[clamp(2.8rem,6vw,5rem)] leading-[0.98]">Concurrency Arena</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">A race condition is just a particular order of steps. Pick the order yourself, watch shared memory change, then fix the program and prove the fix by checking every possible order.</p>
      <p className="mt-3 text-sm text-ink-2">Builds on <Link href={chapterHref({ id: "C5" })} className="u-link">C5 Concurrency &amp; parallelism</Link> and <Link href="/labs/event-loop" className="u-link">the event loop</Link>. Four scenarios, each with an unsafe and a safe version.</p>
      <div className="mt-8"><ConcurrencyArena /></div>
    </div>
  );
}
