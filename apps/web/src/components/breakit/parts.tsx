"use client";
import { clsx } from "clsx";
import { useMedia } from "@/lib/useMedia";
import { capacityOf } from "@/lib/arch/load";
import type { Fault, LoadResult } from "@/lib/arch/load";
import { buildLog, evaluate, nodeStatus, peakBacklog, recoverySeconds, type NodeStatus, type Setup, type Slo } from "@/lib/arch/incidents";
import type { ArchNode, Graph } from "@/lib/arch/sim";

const fmt = (ms: number) => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1));
const STATUS_LABEL: Record<NodeStatus, string> = { ok: "healthy", busy: "queueing", saturated: "saturated", fault: "FAULT" };

/** Layout by distance from the client: left-to-right on wide screens, top-to-bottom on narrow ones (so text stays readable). */
function layout(g: Graph, vertical: boolean) {
  const depth = new Map<string, number>(); const start = g.nodes.find((n) => n.kind === "client")?.id;
  if (start) { depth.set(start, 0); const q = [start]; while (q.length) { const id = q.shift()!; for (const e of g.edges) if (e.from === id && !depth.has(e.to)) { depth.set(e.to, depth.get(id)! + 1); q.push(e.to); } } }
  for (const n of g.nodes) if (!depth.has(n.id)) depth.set(n.id, 0);
  const cols = new Map<number, string[]>(); for (const n of g.nodes) { const d = depth.get(n.id)!; cols.set(d, [...(cols.get(d) ?? []), n.id]); }
  const maxD = Math.max(...cols.keys()), pos = new Map<string, { x: number; y: number }>();
  const W = vertical ? 340 : 640, H = vertical ? 70 + maxD * 78 : 230;
  for (const [d, ids] of cols) ids.forEach((id, i) => pos.set(id, vertical ? { x: ((i + 1) * W) / (ids.length + 1), y: 30 + (maxD ? (d / maxD) * (H - 60) : 0) } : { x: 60 + (maxD ? (d / maxD) * (W - 120) : 0), y: ((i + 1) * H) / (ids.length + 1) }));
  return { W, H, pos, vertical };
}

export function Topology({ g, r, faults, t }: { g: Graph; r: LoadResult; faults: Fault[]; t: number }) {
  const wide = useMedia("(min-width: 640px)", true);
  const { W, H, pos, vertical } = layout(g, !wide);
  const bw = vertical ? 82 : 96, bh = vertical ? 42 : 46;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={`System at second ${t}`}>
      {g.edges.map((e) => { const a = pos.get(e.from), b = pos.get(e.to); return a && b ? <line key={e.id} x1={vertical ? a.x : a.x + bw / 2} y1={vertical ? a.y + bh / 2 : a.y} x2={vertical ? b.x : b.x - bw / 2} y2={vertical ? b.y - bh / 2 : b.y} stroke="var(--line-strong)" strokeWidth="1.5" /> : null; })}
      {g.nodes.map((n) => {
        const p = pos.get(n.id)!, s = n.kind === "client" ? { status: "ok" as const, queue: 0 } : nodeStatus(r, faults, n.id, t);
        const fill = s.status === "fault" ? "var(--warn)" : s.status === "saturated" ? "color-mix(in oklab, var(--warn) 18%, var(--surface))" : "var(--surface)";
        const stroke = s.status === "ok" ? "var(--line-strong)" : "var(--warn)";
        return (
          <g key={n.id} transform={`translate(${p.x - bw / 2},${p.y - bh / 2})`} role="img" aria-label={`${n.label}: ${STATUS_LABEL[s.status]}${s.queue ? `, ${s.queue} waiting` : ""}${s.fault ? `, ${s.fault.kind}` : ""}`}>
            <rect width={bw} height={bh} rx="9" fill={fill} stroke={stroke} strokeWidth="1.5" />
            <text x={bw / 2} y={bh * 0.4} textAnchor="middle" fontSize={vertical ? 11 : 13} fontWeight="500" style={{ fill: s.status === "fault" ? "#fff" : "var(--ink)" }}>{n.label.length > 13 ? n.label.slice(0, 12) + "…" : n.label}</text>
            <text x={bw / 2} y={bh * 0.78} textAnchor="middle" fontSize={vertical ? 10 : 11} style={{ fill: s.status === "fault" ? "#fff" : "var(--ink-2)" }}>{s.status === "fault" ? s.fault!.kind : s.queue ? `${s.queue} waiting` : n.kind === "client" ? "" : STATUS_LABEL[s.status]}</text>
          </g>);
      })}
    </svg>
  );
}

export function Charts({ r, faults, t, onSeek }: { r: LoadResult; faults: Fault[]; t: number; onSeek: (t: number) => void }) {
  const n = r.timeline.length, W = 640, H = 90, peak = Math.max(10, ...r.timeline.map((s) => Math.max(s.offered, s.ok)));
  const qmax = Math.max(10, ...r.timeline.map((s) => Object.values(s.queues).reduce((a, b) => a + b, 0)));
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const line = (f: (i: number) => number, max: number) => r.timeline.map((_, i) => `${x(i)},${H - (Math.min(f(i), max) / max) * H}`).join(" ");
  const shade = faults.map((f, k) => <rect key={k} x={x(f.at)} y={0} width={Math.max(2, x(Math.min(f.until, n - 1)) - x(f.at))} height={H} fill="var(--warn)" opacity="0.12" />);
  const Chart = ({ title, label, children }: { title: string; label: string; children: React.ReactNode }) => (
    <figure className="mt-3"><figcaption className="text-xs text-ink-3">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full cursor-pointer rounded-lg bg-bg-2" role="img" aria-label={label} onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); onSeek(Math.round(((e.clientX - b.left) / b.width) * (n - 1))); }}>
        {shade}{children}<line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" /></svg></figure>);
  return (<>
    <Chart title="Requests per second: arriving (grey) and completed in time (orange). Shaded = fault active." label={`Arriving and completed requests per second over ${n} seconds. Peak ${peak}.`}>
      <polyline fill="none" stroke="var(--line-strong)" strokeWidth="2" points={line((i) => r.timeline[i]!.offered, peak)} /><polyline fill="none" stroke="var(--signal)" strokeWidth="2" points={line((i) => r.timeline[i]!.ok, peak)} /></Chart>
    <Chart title="Requests waiting in queues (all components added up)" label={`Total waiting requests per second. Peak ${qmax}.`}>
      <polyline fill="none" stroke="var(--warn)" strokeWidth="2" points={line((i) => Object.values(r.timeline[i]!.queues).reduce((a, b) => a + b, 0), qmax)} /></Chart>
    <details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">Data table</summary>
      <div className="mt-2 max-h-48 overflow-auto"><table className="w-full"><thead><tr className="text-left text-ink-3"><th>Second</th><th>Arrived</th><th>OK</th><th>Waiting</th></tr></thead>
        <tbody>{r.timeline.map((s) => <tr key={s.t} className={clsx("border-t border-line", s.t === t && "font-medium")}><td>{s.t}</td><td>{s.offered}</td><td>{s.ok}</td><td>{Object.values(s.queues).reduce((a, b) => a + b, 0)}</td></tr>)}</tbody></table></div></details>
  </>);
}

export function LogPanel({ r, g, t }: { r: LoadResult; g: Graph; t: number }) {
  const lines = buildLog(r, g).filter((e) => e.t <= t * 1000 + 999).slice(-60);
  const tone = { info: "text-[#b5b1a6]", warn: "text-[#e6b450]", error: "text-[#ff8a7a]" } as const;
  return (
    <div className="code max-h-64 overflow-auto rounded-2xl border border-line-strong p-4 text-[0.76rem] leading-relaxed" role="log" aria-label={`Logs up to second ${t}`} tabIndex={0}>
      <div className="mb-2 text-[0.62rem] uppercase tracking-widest text-[#8a867b]">logs up to t={t}s</div>
      {lines.length === 0 && <div className="text-[#8a867b]">nothing yet</div>}
      {lines.map((e, i) => <div key={i} className={tone[e.level]}><span className="text-[#a8a499]">{(e.t / 1000).toFixed(1).padStart(5)}s </span>{e.level === "error" ? "ERROR " : e.level === "warn" ? "WARN  " : "INFO  "}{e.msg}</div>)}
    </div>
  );
}

export function NodeTable({ r, g }: { r: LoadResult; g: Graph }) {
  const rows = Object.entries(r.nodes).sort((a, b) => b[1].util - a[1].util);
  return (
    <table className="w-full text-sm"><caption className="sr-only">Utilisation and longest queue per component</caption>
      <thead><tr className="text-left text-ink-3"><th className="font-normal">Component</th><th className="font-normal">Busy</th><th className="font-normal">Longest queue</th></tr></thead>
      <tbody>{rows.map(([id, n]) => <tr key={id} className="border-t border-line"><td className="py-1.5">{g.nodes.find((x) => x.id === id)?.label ?? id} <span className="text-xs text-ink-3">({capacityOf(g.nodes.find((x) => x.id === id) as ArchNode)} slots)</span></td>
        <td><span className="inline-block h-2 w-20 overflow-hidden rounded bg-bg-2 align-middle"><span className={clsx("block h-2", n.util > 0.9 ? "bg-warn" : "bg-trace")} style={{ width: `${Math.round(n.util * 100)}%` }} /></span> <span className="font-mono text-xs">{(n.util * 100).toFixed(0)}%</span></td>
        <td className="font-mono text-xs">{n.maxQueue}</td></tr>)}</tbody></table>
  );
}

const field = "mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2";
export function Levers({ s, onChange }: { s: Setup; onChange: (s: Setup) => void }) {
  const set = (f: (x: Setup) => void) => { const c = structuredClone(s); f(c); onChange(c); };
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));
  const pools = s.graph.nodes.filter((n) => capacityOf(n) > 0 && n.kind !== "cache");
  const cache = s.graph.nodes.find((n) => n.kind === "cache");
  const l = s.load;
  return (
    <div className="space-y-4 text-sm">
      <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-xs uppercase tracking-wider text-ink-3">Capacity (requests served at once)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{pools.map((n) => <label key={n.id}>{n.label}<input type="number" min={1} max={500} value={capacityOf(n)} onChange={(e) => set((x) => { x.graph.nodes.find((m) => m.id === n.id)!.capacity = num(e.target.value, 1, 500); })} className={field} /></label>)}
          {cache && <label>Cache hit rate (%)<input type="number" min={0} max={100} value={Math.round(cache.hitRate * 100)} onChange={(e) => set((x) => { x.graph.nodes.find((m) => m.id === cache.id)!.hitRate = num(e.target.value, 0, 100) / 100; })} className={field} /></label>}</div></fieldset>
      <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-xs uppercase tracking-wider text-ink-3">Clients</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>Timeout (ms)<input type="number" min={50} max={10000} step={50} value={l.timeoutMs} onChange={(e) => set((x) => { x.load.timeoutMs = num(e.target.value, 50, 10000); })} className={field} /></label>
          <label>Retries<input type="number" min={0} max={5} value={l.retries} onChange={(e) => set((x) => { x.load.retries = num(e.target.value, 0, 5); })} className={field} /></label>
          <label>First backoff (ms)<input type="number" min={10} max={2000} step={10} value={l.backoffMs} onChange={(e) => set((x) => { x.load.backoffMs = num(e.target.value, 10, 2000); })} className={field} /></label>
          <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={!!l.jitter} onChange={(e) => set((x) => { x.load.jitter = e.target.checked; })} />Jitter the backoff</label>
          <label className="flex items-end gap-2 pb-2 sm:col-span-2"><input type="checkbox" checked={!!l.breaker} onChange={(e) => set((x) => { x.load.breaker = e.target.checked ? { failures: 5, cooldownMs: 1000 } : null; })} />Circuit breaker (opens after 5 failures, 1 s)</label>
        </div></fieldset>
      <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-xs uppercase tracking-wider text-ink-3">Protections on the servers (0 = off)</legend>
        <div className="grid grid-cols-2 gap-3">
          <label>Call timeout (ms): API stops waiting on a dependency<input type="number" min={0} max={5000} step={10} value={l.callTimeoutMs ?? 0} onChange={(e) => set((x) => { x.load.callTimeoutMs = num(e.target.value, 0, 5000); })} className={field} /></label>
          <label>Queue limit: reject when this many are waiting<input type="number" min={0} max={1000} value={l.queueLimit ?? 0} onChange={(e) => set((x) => { x.load.queueLimit = num(e.target.value, 0, 1000); })} className={field} /></label>
        </div></fieldset>
    </div>
  );
}

export function Compare({ before, after, slo, faults, beforeLabel = "Before", afterLabel = "After" }: { before: LoadResult; after: LoadResult; slo: Slo; faults: Fault[]; beforeLabel?: string; afterLabel?: string }) {
  const rec = (r: LoadResult) => { const x = recoverySeconds(r, faults); return faults.length ? (x === null ? "never" : `${x} s`) : "n/a"; };
  const rows: [string, string, string][] = [
    ["Succeeded", `${(before.successRate * 100).toFixed(1)}%`, `${(after.successRate * 100).toFixed(1)}%`],
    ["p95 latency", `${fmt(before.p95)} ms`, `${fmt(after.p95)} ms`],
    ["Load offered (with retries)", `${before.amplification.toFixed(2)}x`, `${after.amplification.toFixed(2)}x`],
    ["Rejected on purpose / fast-failed", String(before.shed + before.fastFailed), String(after.shed + after.fastFailed)],
    ["Longest queue", String(peakBacklog(before)), String(peakBacklog(after))],
    ["Recovery after the fault", rec(before), rec(after)],
  ];
  const ev = evaluate(slo, after, faults);
  return (
    <div data-testid="compare">
      <table className="w-full text-sm"><caption className="sr-only">Before and after</caption>
        <thead><tr className="text-left text-ink-3"><th className="font-normal"></th><th className="font-normal">{beforeLabel}</th><th className="font-normal">{afterLabel}</th></tr></thead>
        <tbody>{rows.map(([k, a, b]) => <tr key={k} className="border-t border-line"><td className="py-1.5 text-ink-2">{k}</td><td className="font-mono">{a}</td><td className="font-mono">{b}</td></tr>)}</tbody></table>
      <ul className="mt-3 space-y-1 text-sm" aria-label="Service level objective checks">
        {ev.checks.map((c) => <li key={c.label} className={c.ok ? "text-ok" : "text-warn"}><span aria-hidden>{c.ok ? "✓" : "✗"}</span> <span className="sr-only">{c.ok ? "Pass: " : "Fail: "}</span>{c.label}: {c.value} <span className="text-ink-3">(need {c.limit})</span></li>)}
      </ul>
      <p role="status" className={clsx("mt-3 font-medium", ev.pass ? "text-ok" : "text-warn")}>{ev.pass ? "Fixed: the objective is met." : "Not fixed yet: at least one objective is still missed."}</p>
    </div>
  );
}
