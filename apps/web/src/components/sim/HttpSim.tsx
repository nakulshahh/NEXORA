"use client";
import { Database, Globe, Server, Waypoints, Zap } from "lucide-react";
import { clsx } from "clsx";
import { useMedia } from "@/lib/useMedia";
import { FlowStage, type FlowNode, type Layout } from "../viz/FlowStage";
import { HTTP_GROUPS, HTTP_SPEC, type HttpState } from "@/sim/http";
import { SimShell, type ViewProps } from "./SimShell";

const WIDE: Layout = { w: 1000, h: 400, p: { browser: { x: 96, y: 200 }, dns: { x: 316, y: 80 }, server: { x: 556, y: 200 }, cache: { x: 868, y: 80 }, db: { x: 868, y: 330 } } };
const TALL: Layout = { w: 360, h: 640, p: { browser: { x: 84, y: 60 }, dns: { x: 276, y: 160 }, server: { x: 84, y: 310 }, cache: { x: 276, y: 440 }, db: { x: 276, y: 580 } } };
const NODES: Record<string, FlowNode> = {
  browser: { label: "Browser", icon: Globe }, dns: { label: "DNS", icon: Waypoints }, server: { label: "Server", icon: Server },
  cache: { label: "Redis", icon: Zap }, db: { label: "Postgres", icon: Database },
};
const TONE: Record<string, string> = { DNS: "bg-trace", Connect: "bg-ink-3", TLS: "bg-signal/60", App: "bg-ink-2", Cache: "bg-trace/60", Database: "bg-signal", Response: "bg-ok" };

function View({ step, steps, index, reduce }: ViewProps<HttpState>) {
  const wide = useMedia("(min-width: 820px)", true);
  const done = steps.slice(0, index + 1);
  const total = steps.at(-1)!.state.elapsed;
  const by = HTTP_GROUPS.map((g) => ({ g, ms: done.filter((s) => s.state.group === g).reduce((a, s) => a + s.ms, 0) })).filter((x) => x.ms > 0);
  const grand = steps.reduce((a, s) => a + s.ms, 0) || 1;
  const wire = done.flatMap((s) => s.state.wire.map((w, k) => ({ key: `${s.id}-${k}`, ...w, live: s === step }))).slice(-8);
  return (
    <div>
      <FlowStage L={wide ? WIDE : TALL} nodes={NODES} legs={steps.map((s) => ({ id: s.id, from: s.state.from, to: s.state.to }))} i={index} reduce={reduce} />
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="eyebrow">Time so far</span>
          <span className="font-mono text-sm tnum" aria-label={`${step.state.elapsed} milliseconds elapsed of ${total} total`}>{step.state.elapsed} ms <span className="text-ink-3">of {total} ms</span></span>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-bg-2" role="img" aria-label={`Time by phase: ${by.map((b) => `${b.g} ${Math.round(b.ms * 10) / 10} milliseconds`).join(", ")}`}>
          {by.map((b) => <span key={b.g} className={clsx("h-full transition-[width] duration-500", TONE[b.g])} style={{ width: `${(b.ms / grand) * 100}%` }} />)}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">{by.map((b) => <li key={b.g} className="flex items-center gap-1.5"><i className={clsx("h-2 w-2 rounded-full", TONE[b.g])} />{b.g} <span className="font-mono tnum">{Math.round(b.ms * 10) / 10} ms</span></li>)}</ul>
      </div>
      <div className="code mt-3 rounded-2xl border border-line-strong p-4 text-[0.78rem] leading-relaxed" aria-hidden="true">
        <div className="mb-2 text-[0.62rem] uppercase tracking-widest text-[#8a867b]">On the wire</div>
        {wire.map((w) => <div key={w.key} className={clsx("truncate", w.live ? "text-[#ece8de]" : "text-[#8a867b]")}><span className="mr-2 text-[#ff6b3d]">{w.dir === "out" ? "→" : w.dir === "in" ? "←" : "·"}</span>{w.text}</div>)}
      </div>
    </div>
  );
}
export function HttpSim({ embedded = false }: { embedded?: boolean }) { return <SimShell spec={HTTP_SPEC} view={View} embedded={embedded} href="/labs/http" />; }
