"use client";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, Position, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Cog, Database, Globe, Inbox, Monitor, Server, Split, Trash2, Zap } from "lucide-react";
import { clsx } from "clsx";
import { LOAD_DEFAULTS, capacityOf, nodeCeiling, simulateLoad, type LoadParams, type LoadResult } from "@/lib/arch/load";
import { KINDS, PRESETS, makeNode, rng, sanitizeSaved, simulateMany, simulateRequest, validate, type ArchNode, type Graph, type Kind, type RequestResult, type Stats } from "@/lib/arch/sim";

const ICON: Record<Kind, typeof Server> = { client: Monitor, cdn: Globe, lb: Split, api: Server, cache: Zap, db: Database, queue: Inbox, worker: Cog };
const KEY = "nexora-arch-v1";
type NData = { arch: ArchNode; state?: "ok" | "fail" };
type RFNode = Node<NData, "arch">;

function ArchNodeView({ data, selected }: NodeProps<RFNode>) {
  const a = data.arch; const Icon = ICON[a.kind];
  return (
    <div className={clsx("min-w-[8.5rem] rounded-xl border bg-surface px-3 py-2 text-sm shadow-sm transition-colors",
      selected ? "border-ink" : data.state === "fail" ? "border-warn" : data.state === "ok" ? "border-ok" : "border-line-strong", a.down && "opacity-60")}>
      {a.kind !== "client" && <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-line-strong !bg-bg-2" />}
      <div className="flex items-center gap-2"><Icon size={15} className="text-signal-ink" /><span className="font-medium">{a.label}</span></div>
      <div className="mt-0.5 flex items-center gap-2 font-mono text-[0.7rem] text-ink-3">
        {a.kind !== "client" && <span>{a.latency} ms</span>}
        {(a.kind === "cache" || a.kind === "cdn") && <span>hit {Math.round(a.hitRate * 100)}%</span>}
        {a.down && <span className="rounded bg-warn/15 px-1 text-warn">DOWN</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-line-strong !bg-bg-2" />
    </div>
  );
}
const nodeTypes = { arch: ArchNodeView };

const layout = (g: Graph): RFNode[] => {
  // simple left-to-right layering by distance from the client
  const depth = new Map<string, number>(); const q = g.nodes.filter((n) => n.kind === "client").map((n) => n.id);
  q.forEach((id) => depth.set(id, 0));
  for (let i = 0; i < q.length; i++) for (const e of g.edges) if (e.from === q[i] && !depth.has(e.to)) { depth.set(e.to, depth.get(q[i]!)! + 1); q.push(e.to); }
  const col = new Map<number, number>();
  return g.nodes.map((n) => { const d = depth.get(n.id) ?? 0; const r = col.get(d) ?? 0; col.set(d, r + 1); return { id: n.id, type: "arch", position: { x: d * 210, y: r * 100 }, data: { arch: n } }; });
};
const toEdges = (g: Graph): Edge[] => g.edges.map((e) => ({ id: e.id, source: e.from, target: e.to }));
const graphOf = (nodes: RFNode[], edges: Edge[]): Graph => ({ nodes: nodes.map((n) => n.data.arch), edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })) });
const fmt = (ms: number) => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1));

export function ArchBuilder() {
  const [nodes, setNodes] = useState<RFNode[]>(() => layout(PRESETS[1]!.graph));
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(PRESETS[1]!.graph));
  const [selected, setSelected] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const [one, setOne] = useState<RequestResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lp, setLp] = useState<Omit<LoadParams, "seed">>({ rps: LOAD_DEFAULTS.rps, seconds: LOAD_DEFAULTS.seconds, timeoutMs: LOAD_DEFAULTS.timeoutMs, retries: LOAD_DEFAULTS.retries, backoffMs: LOAD_DEFAULTS.backoffMs });
  const [loadRes, setLoadRes] = useState<LoadResult | null>(null);
  const [ready, setReady] = useState(false); const flow = useRef<ReactFlowInstance<RFNode, Edge> | null>(null); const refit = () => setTimeout(() => flow.current?.fitView({ padding: 0.25, duration: 150 }), 50);
  const counter = useRef(0); const rr = useRef(new Map<string, number>()); const rand = useRef(rng(1));

  useEffect(() => {   // restore the last layout from this browser, if valid
    try {
      const s = sanitizeSaved(JSON.parse(localStorage.getItem(KEY) ?? "null"));
      if (s) { setNodes(s.nodes.map(({ x, y, ...arch }) => ({ id: arch.id, type: "arch", position: { x, y }, data: { arch } }))); setEdges(s.edges.map((e) => ({ id: e.id, source: e.from, target: e.to }))); }
    } catch { /* storage unavailable or corrupt: keep the default */ }
    setReady(true);   // batched with the restored state, so the save effect below never sees the defaults as "ready"
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify({ nodes: nodes.map((n) => ({ ...n.data.arch, x: Math.round(n.position.x), y: Math.round(n.position.y) })), edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })) })); } catch {}
  }, [nodes, edges, ready]);

  const graph = useMemo(() => graphOf(nodes, edges), [nodes, edges]);
  const warnings = useMemo(() => validate(graph), [graph]);
  const sel = nodes.find((n) => n.id === selected)?.data.arch ?? null;

  const clearRun = () => { setOne(null); setStats(null); setLoadRes(null); setNodes((ns) => ns.map((n) => (n.data.state ? { ...n, data: { ...n.data, state: undefined } } : n))); setEdges((es) => es.map((e) => ({ ...e, animated: false, style: undefined }))); };
  const onNodes = useCallback((c: NodeChange<RFNode>[]) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdges = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), []);
  const onConnect = useCallback((c: Connection) => setEdges((es) => (c.source === c.target || es.some((e) => e.source === c.source && e.target === c.target) ? es : addEdge({ ...c, id: `${c.source}->${c.target}` }, es))), []);
  const patch = (id: string, p: Partial<ArchNode>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, arch: { ...n.data.arch, ...p } } } : n)));

  const add = (kind: Kind) => {
    const id = `n${Date.now().toString(36)}${counter.current++}`;
    const same = nodes.filter((n) => n.data.arch.kind === kind).length;
    const label = same ? `${KINDS[kind].label} ${same + 1}` : KINDS[kind].label;
    setNodes((ns) => [...ns, { id, type: "arch", position: { x: 40 + (ns.length % 5) * 40, y: 260 + (ns.length % 4) * 30 }, data: { arch: makeNode(id, kind, label) } }]);
    setSelected(id); refit();
  };
  const load = (i: number) => { const g = PRESETS[i]!.graph; setNodes(layout(structuredClone(g))); setEdges(toEdges(g)); setSelected(null); setOne(null); setStats(null); setLoadRes(null); rr.current = new Map(); refit(); };
  const remove = (id: string) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); setSelected(null); };

  const sendOne = () => {
    if (warnings.some((w) => w.level === "error")) return;
    const r = simulateRequest(graph, rand.current, rr.current);
    setOne(r); setStats(null);
    const visited = new Set(r.hops.map((h) => h.to)); const bad = new Set(r.hops.filter((h) => !h.ok).map((h) => h.to));
    const first = graph.nodes.find((n) => n.kind === "client");
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, state: bad.has(n.id) ? "fail" : visited.has(n.id) || n.id === first?.id ? "ok" : undefined } })));
    const used = new Set(r.hops.map((h) => `${h.from}->${h.to}`));
    setEdges((es) => es.map((e) => ({ ...e, animated: used.has(e.id), style: used.has(e.id) ? { stroke: r.hops.find((h) => `${h.from}->${h.to}` === e.id)?.ok === false ? "var(--warn)" : "var(--ok)", strokeWidth: 2 } : undefined })));
  };
  const sendMany = () => { if (warnings.some((w) => w.level === "error")) return; setOne(null); setStats(simulateMany(graph, 500, seed)); setNodes((ns) => ns.map((n) => (n.data.state ? { ...n, data: { ...n.data, state: undefined } } : n))); setEdges((es) => es.map((e) => ({ ...e, animated: false, style: undefined }))); };
  const runLoad = () => { if (warnings.some((w) => w.level === "error")) return; setOne(null); setStats(null); setLoadRes(simulateLoad(graph, { ...lp, seed })); };
  const num = (v: string, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || d));
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const blocked = warnings.some((w) => w.level === "error");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Add components">
          {(Object.keys(KINDS) as Kind[]).map((k) => { const Icon = ICON[k]; return (
            <button key={k} type="button" onClick={() => add(k)} title={KINDS[k].blurb} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-ink-2 hover:border-ink hover:text-ink"><Icon size={14} />{KINDS[k].label}</button>); })}
        </div>
        <div className="mt-3 h-[26rem] overflow-hidden rounded-2xl border border-line bg-bg-2" data-testid="canvas">
          <ReactFlow onInit={(i) => { flow.current = i; }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodes} onEdgesChange={onEdges} onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.4} maxZoom={1.6} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}>
            <Background gap={22} color="var(--line)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <p className="mt-2 text-xs text-ink-3">Drag from a node&rsquo;s right dot to another node&rsquo;s left dot to connect. Select an edge or node and press Delete to remove it.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={sendOne} disabled={blocked} className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-40">Send 1 request</button>
          <button type="button" onClick={sendMany} disabled={blocked} className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-sm hover:border-ink disabled:opacity-40">Send 500</button>
          <button type="button" onClick={runLoad} disabled={blocked} className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-sm hover:border-ink disabled:opacity-40">Load test</button>
          <button type="button" onClick={clearRun} className="inline-flex h-10 items-center rounded-full px-3 text-sm text-ink-2 hover:text-ink">Clear</button>
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">Seed
            <input type="number" min={1} max={999999} value={seed} onChange={(e) => setSeed(Math.max(1, Math.min(999999, Math.floor(Number(e.target.value)) || 1)))} className="h-9 w-24 rounded-lg border border-line-strong bg-bg px-2 text-ink" /></label>
        </div>

        <section aria-label="Load test settings" className="mt-4 rounded-2xl border border-line p-4">
          <p className="text-sm font-medium">Load test <span className="font-normal text-ink-3">(arrival rate, capacity, queues, timeouts and retries)</span></p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <label>Requests/s<input type="number" min={1} max={1000} value={lp.rps} onChange={(e) => setLp({ ...lp, rps: num(e.target.value, 1, 1000, 100) })} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2" /></label>
            <label>Duration (s)<input type="number" min={5} max={60} value={lp.seconds} onChange={(e) => setLp({ ...lp, seconds: num(e.target.value, 5, 60, 20) })} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2" /></label>
            <label>Client timeout (ms)<input type="number" min={50} max={10000} step={50} value={lp.timeoutMs} onChange={(e) => setLp({ ...lp, timeoutMs: num(e.target.value, 50, 10000, 1000) })} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2" /></label>
            <label>Retries<input type="number" min={0} max={5} value={lp.retries} onChange={(e) => setLp({ ...lp, retries: num(e.target.value, 0, 5, 0) })} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2" /></label>
          </div>
        </section>
        <ul aria-live="polite" className="mt-3 space-y-1 text-sm">{warnings.map((w, i) => <li key={i} className={w.level === "error" ? "text-warn" : "text-ink-2"}>{w.level === "error" ? "Fix: " : "Note: "}{w.text}</li>)}</ul>

        {one && (
          <section aria-label="Request trace" className="mt-5 rounded-2xl border border-line bg-surface p-5" data-testid="trace">
            <p className="font-medium">{one.ok ? <span className="text-ok">{one.status} OK</span> : <span className="text-warn">{one.status} failed: {one.reason}</span>} <span className="ml-2 font-mono text-sm text-ink-2">{fmt(one.total)} ms{one.cacheHit && " · cache hit"}</span></p>
            <ol className="mt-4 space-y-2">
              {one.hops.map((h, i) => (
                <li key={i} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm">
                  <span className="truncate">{label(h.to)} <span className="text-ink-3">{h.note}</span></span>
                  <span className="relative h-3 rounded bg-bg-2"><span className={clsx("absolute top-0 h-3 rounded", h.ok ? "bg-trace" : "bg-warn")} style={{ left: `${(h.start / Math.max(one.total, 1)) * 100}%`, width: `${Math.max(1.5, ((h.end - h.start) / Math.max(one.total, 1)) * 100)}%` }} /></span>
                  <span className="text-right font-mono text-xs text-ink-2">{fmt(h.end - h.start)} ms</span>
                </li>))}
            </ol>
            <p className="mt-3 text-xs text-ink-3">Bars show when each hop ran along the request&rsquo;s total time. Nested calls overlap their parent.</p>
          </section>)}


        {loadRes && <LoadReport r={loadRes} graph={graph} lp={lp} seed={seed} />}
        {stats && (
          <section aria-label="Statistics for 500 requests" className="mt-5 rounded-2xl border border-line bg-surface p-5" data-testid="stats">
            <p className="font-medium">500 requests, seed {seed}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {([["Success", `${(stats.successRate * 100).toFixed(1)}%`], ["p50", `${fmt(stats.p50)} ms`], ["p95", `${fmt(stats.p95)} ms`], ["p99", `${fmt(stats.p99)} ms`], ["Mean", `${fmt(stats.mean)} ms`], ["Cache hits", `${(stats.cacheHitRate * 100).toFixed(0)}%`]] as const).map(([k, v]) => <div key={k}><dt className="text-ink-3">{k}</dt><dd className="font-mono">{v}</dd></div>)}
            </dl>
            {Object.keys(stats.failuresBy).length > 0 && <p className="mt-3 text-sm text-ink-2">Failures by component: {Object.entries(stats.failuresBy).map(([id, n]) => `${label(id)} ${n}`).join(", ")}. Latency figures cover successful requests only.</p>}
          </section>)}
      </div>

      <aside className="space-y-4" aria-label="Inspector and presets">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="font-medium">Start from</p>
          <ul className="mt-2 space-y-1">{PRESETS.map((p, i) => <li key={p.id}><button type="button" onClick={() => load(i)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-2"><span className="font-medium">{p.name}</span><span className="block text-xs text-ink-3">{p.blurb}</span></button></li>)}</ul>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4" data-testid="inspector">
          {sel ? (<>
            <div className="flex items-center justify-between"><p className="font-medium">{KINDS[sel.kind].label}</p>
              <button type="button" onClick={() => remove(sel.id)} aria-label={`Delete ${sel.label}`} className="rounded p-1 text-ink-3 hover:text-warn"><Trash2 size={15} /></button></div>
            <p className="mt-1 text-xs text-ink-3">{KINDS[sel.kind].blurb}</p>
            <label className="mt-3 block text-sm">Name<input value={sel.label} maxLength={30} onChange={(e) => patch(sel.id, { label: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2" /></label>
            {sel.kind !== "client" && <label className="mt-3 block text-sm">Latency: {sel.latency} ms<input type="range" min={0} max={500} step={1} value={sel.latency} onChange={(e) => patch(sel.id, { latency: Number(e.target.value) })} className="w-full accent-[var(--signal)]" /></label>}
            {(sel.kind === "cache" || sel.kind === "cdn") && <label className="mt-3 block text-sm">Hit rate: {Math.round(sel.hitRate * 100)}%<input type="range" min={0} max={100} step={1} value={Math.round(sel.hitRate * 100)} onChange={(e) => patch(sel.id, { hitRate: Number(e.target.value) / 100 })} className="w-full accent-[var(--signal)]" /></label>}
            {sel.kind !== "client" && <label className="mt-3 block text-sm">Random error rate: {(sel.errorRate * 100).toFixed(1)}%<input type="range" min={0} max={50} step={0.5} value={sel.errorRate * 100} onChange={(e) => patch(sel.id, { errorRate: Number(e.target.value) / 100 })} className="w-full accent-[var(--signal)]" /></label>}
            {capacityOf(sel) > 0 && <label className="mt-3 block text-sm">Capacity: {capacityOf(sel)} at once{nodeCeiling(sel) ? <span className="text-ink-3"> (about {Math.round(nodeCeiling(sel)! * 10) / 10} req/s max)</span> : null}<input type="range" min={1} max={200} step={1} value={Math.min(200, capacityOf(sel))} onChange={(e) => patch(sel.id, { capacity: Number(e.target.value) })} className="w-full accent-[var(--signal)]" /></label>}
            {sel.kind !== "client" && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.down} onChange={(e) => patch(sel.id, { down: e.target.checked })} />Take it down (always fails)</label>}
          </>) : <p className="text-sm text-ink-2">Select a component to change its latency, hit rate or error rate, or to take it down.</p>}
        </div>
      </aside>

      <details className="lg:col-span-2 rounded-2xl border border-line p-4 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">The rules of this model, and what it leaves out</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>A request starts at the client and follows connections. Each hop costs the component&rsquo;s latency (±20% jitter) plus 1 ms of network.</li>
          <li>CDN: answers itself with its hit rate, otherwise forwards. Load balancer: round-robin over components that are not down; none left gives 503.</li>
          <li>API: calls what it is connected to, in the order you connected them. A cache is cache-aside: a hit skips the database, a miss goes on and pays a write-back. A queue is fire-and-forget: the request only pays the enqueue, so a slow worker does not slow it. A failing database or queue makes the API return 502; a dead cache is tolerated.</li>
          <li>Load test: requests arrive at random (Poisson) at your rate. Each component serves only as many at once as its capacity, the rest wait in a first-in-first-out queue. The client gives up at its timeout and may retry with doubling delay, but the abandoned request keeps using the servers. A queue component accepts instantly and its workers drain it, so a backlog shows on the worker.</li>
          <li>Not modelled: service times that grow under load, queue limits and load shedding, connection setup, partial failures, geography, the response&rsquo;s return trip. Numbers teach the shape of trade-offs; they do not predict a real system.</li>
        </ul>
      </details>
    </div>
  );
}

function LoadReport({ r, graph, lp, seed }: { r: LoadResult; graph: Graph; lp: Omit<LoadParams, "seed">; seed: number }) {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const rows = Object.entries(r.nodes).sort((a, b) => b[1].util - a[1].util);
  const worst = rows[0];
  const peak = Math.max(1, ...r.timeline.map((x) => Math.max(x.offered, x.ok)));
  const W = 320, H = 70, pt = (i: number, v: number) => `${(i / Math.max(1, r.timeline.length - 1)) * W},${H - (v / peak) * H}`;
  const line = (k: "offered" | "ok") => r.timeline.map((x, i) => pt(i, x[k])).join(" ");
  const saturated = worst && worst[1].util > 0.9;
  return (
    <section aria-label="Load test results" className="mt-5 rounded-2xl border border-line bg-surface p-5" data-testid="load">
      <p className="font-medium">{lp.rps} req/s for {lp.seconds} s, timeout {lp.timeoutMs} ms, {lp.retries} retr{lp.retries === 1 ? "y" : "ies"}, seed {seed}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {([["Succeeded", `${(r.successRate * 100).toFixed(1)}%`], ["Goodput", `${r.goodput.toFixed(0)} /s`], ["Offered (incl. retries)", `${r.offered.toFixed(0)} /s`], ["Retry amplification", `${r.amplification.toFixed(2)}x`], ["p50", `${fmt(r.p50)} ms`], ["p95", `${fmt(r.p95)} ms`], ["p99", `${fmt(r.p99)} ms`], ["Timed out attempts", String(r.timedOut)]] as const).map(([k, v]) => <div key={k}><dt className="text-ink-3">{k}</dt><dd className="font-mono">{v}</dd></div>)}
      </dl>
      {saturated
        ? <p className="mt-3 text-sm text-warn">Bottleneck: {name(worst[0])} is {(worst[1].util * 100).toFixed(0)}% busy and queued up to {worst[1].maxQueue} requests. Adding capacity anywhere else will not help.</p>
        : <p className="mt-3 text-sm text-ink-2">No component is saturated. Raise the rate until one is, then look at which one it is.</p>}
      <table className="mt-4 w-full text-sm"><caption className="sr-only">Utilisation and queue length per component</caption>
        <thead><tr className="text-left text-ink-3"><th className="font-normal">Component</th><th className="font-normal">Busy</th><th className="font-normal">Longest queue</th><th className="font-normal">Served</th></tr></thead>
        <tbody>{rows.map(([id, n]) => <tr key={id} className="border-t border-line"><td className="py-1.5">{name(id)}</td>
          <td><span className="inline-block h-2 w-24 overflow-hidden rounded bg-bg-2 align-middle"><span className={clsx("block h-2", n.util > 0.9 ? "bg-warn" : "bg-trace")} style={{ width: `${Math.round(n.util * 100)}%` }} /></span> <span className="font-mono text-xs">{(n.util * 100).toFixed(0)}%</span></td>
          <td className="font-mono text-xs">{n.maxQueue}</td><td className="font-mono text-xs">{n.served}</td></tr>)}</tbody></table>
      <figure className="mt-4"><svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label={`Offered and successful requests per second over ${lp.seconds} seconds. Peak ${peak}.`}>
        <polyline fill="none" stroke="var(--line-strong)" strokeWidth="2" points={line("offered")} /><polyline fill="none" stroke="var(--signal)" strokeWidth="2" points={line("ok")} /></svg>
        <figcaption className="text-xs text-ink-3">Grey: attempts arriving per second. Orange: completed in time. The gap is the cost of overload.{r.endTime > lp.seconds * 1000 * 1.2 && ` The system needed ${(r.endTime / 1000).toFixed(0)} s to drain its backlog after load stopped.`}</figcaption></figure>
    </section>
  );
}
