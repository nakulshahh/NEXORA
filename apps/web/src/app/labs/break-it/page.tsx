import type { Metadata } from "next";
import Link from "next/link";
import { chapterHref } from "@/lib/routes";
import { BreakItLab } from "@/components/breakit/BreakItLab";

export const metadata: Metadata = { title: "Break-it Lab", description: "Inject a failure, watch the system degrade, find the root cause, fix it and prove the fix by re-running the same incident." };
export default function Page() {
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-2"><Link href="/labs" className="u-link">Labs</Link> / <span className="text-ink">Break-it Lab</span></nav>
      <h1 className="font-display mt-5 text-[clamp(2.8rem,6vw,5rem)] leading-[0.98]">Break-it Lab</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">Production fails in recognisable ways. Break a system on purpose, read the symptoms, find the root cause, then fix it and prove it by re-running the same incident.</p>
      <p className="mt-3 text-sm text-ink-2">Builds on <Link href={chapterHref({ id: "B9" })} className="u-link">B9 Resilience</Link> and <Link href="/labs/http" className="u-link">the request lifecycle</Link>. Seven guided incidents, or design your own experiment.</p>
      <div className="mt-8"><BreakItLab /></div>
    </div>
  );
}
