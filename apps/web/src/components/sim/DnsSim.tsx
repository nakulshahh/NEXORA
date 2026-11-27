"use client";
import { Database, Globe, HardDrive, Layers, Waypoints } from "lucide-react";
import { clsx } from "clsx";
import { useMedia } from "@/lib/useMedia";
import { FlowStage, type FlowNode, type Layout } from "../viz/FlowStage";
import { DNS_SPEC, type DnsState } from "@/sim/dns";
import { SimShell, type ViewProps } from "./SimShell";

const WIDE: Layout = { w: 900, h: 360, p: { client: { x: 80, y: 180 }, resolver: { x: 340, y: 180 }, root: { x: 760, y: 56 }, tld: { x: 760, y: 180 }, auth: { x: 760, y: 304 } } };
const TALL: Layout = { w: 340, h: 600, p: { client: { x: 170, y: 52 }, resolver: { x: 170, y: 190 }, root: { x: 70, y: 360 }, tld: { x: 170, y: 460 }, auth: { x: 270, y: 550 } } };
const NODES: Record<string, FlowNode> = {
  client: { label: "Your machine", sub: "stub resolver", icon: Globe }, resolver: { label: "Resolver", sub: "recursive + cache", icon: Layers },
  root: { label: "Root", sub: ".", icon: Waypoints }, tld: { label: "TLD", icon: Database }, auth: { label: "Authoritative", icon: HardDrive },
};

function View({ step, steps, index, reduce }: ViewProps<DnsState>) {
  const wide = useMedia("(min-width: 820px)", true);
  const hops = steps.slice(0, index + 1).filter((s) => s.state.from !== s.state.to && s.state.from === "resolver" && s.state.to !== "client").length;
  const c = step.state.cache;
  return (
    <div>
      <FlowStage L={wide ? WIDE : TALL} nodes={NODES} legs={steps.map((s) => ({ id: s.id, from: s.state.from, to: s.state.to }))} i={index} reduce={reduce} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4"><span className="eyebrow">Time so far</span><p className="mt-2 font-mono text-2xl tnum">{step.state.elapsed} <span className="text-sm text-ink-3">ms</span></p></div>
        <div className="rounded-2xl border border-line bg-surface p-4"><span className="eyebrow">Servers asked</span><p className="mt-2 font-mono text-2xl tnum">{hops}</p></div>
        <div className={clsx("rounded-2xl border p-4", c ? "border-signal bg-signal-wash" : "border-line bg-surface")}><span className="eyebrow">Resolver cache</span>
          <p className="mt-2 font-mono text-sm leading-snug">{c ? <>{c.name}<br /><span className="text-signal-ink">TTL {c.ttlLeft}s left</span></> : <span className="text-ink-3">empty</span>}</p></div>
      </div>
      <div className="code mt-3 rounded-2xl border border-line-strong p-4 text-[0.78rem] leading-relaxed" aria-hidden="true">
        <div className="mb-2 text-[0.62rem] uppercase tracking-widest text-[#8a867b]">resolver log</div>
        {steps.slice(0, index + 1).slice(-6).map((s, k, a) => <div key={s.id} className={clsx("truncate", k === a.length - 1 ? "text-[#ece8de]" : "text-[#8a867b]")}>{k === a.length - 1 ? "▸ " : "· "}{s.state.line}</div>)}
      </div>
    </div>
  );
}
export function DnsSim({ embedded = false }: { embedded?: boolean }) { return <SimShell spec={DNS_SPEC} view={View} embedded={embedded} href="/labs/dns" />; }
