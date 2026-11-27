/**
 * Architecture simulator: a seeded, deterministic model of one request travelling through a graph of components.
 * It is a *model*: it teaches where latency and failures come from, it does not predict real systems.
 *
 * Rules (also shown in the UI):
 *  - A request starts at the (first) client and follows edges.
 *  - CDN: with probability hitRate it answers itself; otherwise it forwards to its next hop.
 *  - Load balancer: round-robin over healthy targets; none healthy -> 503.
 *  - API: calls its downstream nodes in edge order. A cache downstream is cache-aside: a hit stops the storage calls,
 *    a miss continues to the next downstream and then pays a write-back. A queue downstream is fire-and-forget
 *    (the request only pays the enqueue). Any other downstream failing makes the API fail (502).
 *  - Database / worker: pay their latency, or fail.
 *  - Any node that is `down` fails; otherwise it fails with probability errorRate.
 *  - Each hop costs the node's latency (+-20% jitter) plus LINK_MS of network.
 *  - A node reached twice on one path is a cycle and fails the request (the caller reports it, usually as 502).
 * Single-request traces ignore capacity. Load, queueing, timeouts and retries live in load.ts (a discrete-event run over these same paths).
 * Not modelled: partial failures, geography.
 */
export type Kind = "client" | "cdn" | "lb" | "api" | "cache" | "db" | "queue" | "worker";
export interface ArchNode { id: string; kind: Kind; label: string; latency: number; hitRate: number; errorRate: number; down: boolean;
  /** Concurrent requests the node can serve in the load test (0 or undefined = the default for its kind). Ignored by single-request traces. */
  capacity?: number }
export interface ArchEdge { id: string; from: string; to: string }
export interface Graph { nodes: ArchNode[]; edges: ArchEdge[] }

export const LINK_MS = 1;
export const KINDS: Record<Kind, { label: string; blurb: string; latency: number; hitRate: number; errorRate: number }> = {
  client: { label: "Client", blurb: "Where requests start.", latency: 0, hitRate: 0, errorRate: 0 },
  cdn: { label: "CDN", blurb: "Answers cacheable requests near the user.", latency: 5, hitRate: 0.6, errorRate: 0 },
  lb: { label: "Load balancer", blurb: "Spreads requests over healthy servers.", latency: 1, hitRate: 0, errorRate: 0 },
  api: { label: "API server", blurb: "Runs your handler and calls what it needs.", latency: 15, hitRate: 0, errorRate: 0.001 },
  cache: { label: "Cache", blurb: "Fast, small, may miss (cache-aside).", latency: 1, hitRate: 0.8, errorRate: 0 },
  db: { label: "Database", blurb: "Source of truth. Slower, can fail.", latency: 12, hitRate: 0, errorRate: 0.001 },
  queue: { label: "Queue", blurb: "Accepts work now, runs it later.", latency: 2, hitRate: 0, errorRate: 0 },
  worker: { label: "Worker", blurb: "Consumes the queue, off the request path.", latency: 30, hitRate: 0, errorRate: 0 },
};
export const makeNode = (id: string, kind: Kind, label?: string): ArchNode => ({ id, kind, label: label ?? KINDS[kind].label, latency: KINDS[kind].latency, hitRate: KINDS[kind].hitRate, errorRate: KINDS[kind].errorRate, down: false });

export interface Hop { from: string; to: string; start: number; end: number; note: string; ok: boolean }
export interface RequestResult { ok: boolean; status: number; total: number; hops: Hop[]; cacheHit: boolean; failedAt: string | null; reason: string | null }

/** mulberry32: small, fast, good enough, and identical everywhere. */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export interface Warning { level: "error" | "warn"; text: string }
export function validate(g: Graph): Warning[] {
  const w: Warning[] = [];
  const clients = g.nodes.filter((n) => n.kind === "client");
  if (!clients.length) { w.push({ level: "error", text: "Add a client: requests need somewhere to start." }); return w; }
  if (clients.length > 1) w.push({ level: "warn", text: "Several clients: only the first one sends requests." });
  const seen = new Set<string>(); const stack = [clients[0]!.id];
  while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); for (const e of g.edges) if (e.from === id) stack.push(e.to); }
  for (const n of g.nodes) if (!seen.has(n.id) && n.kind !== "worker") w.push({ level: "warn", text: `${n.label} is not reachable from the client.` });
  if (!g.edges.some((e) => e.from === clients[0]!.id)) w.push({ level: "error", text: "Connect the client to something." });
  return w;
}

interface Ctx { g: Graph; rand: () => number; rr: Map<string, number>; hops: Hop[]; path: string[]; cacheHit: boolean; failedAt: string | null; reason: string | null }
interface Out { ok: boolean; t: number; status: number }
const byId = (g: Graph) => new Map(g.nodes.map((n) => [n.id, n]));
const outs = (g: Graph, id: string) => g.edges.filter((e) => e.from === id).map((e) => g.nodes.find((n) => n.id === e.to)!).filter(Boolean);
const cost = (n: ArchNode, rand: () => number) => LINK_MS + n.latency * (0.8 + 0.4 * rand());

function fail(c: Ctx, n: ArchNode, reason: string, t: number, status: number): Out { if (!c.failedAt) { c.failedAt = n.id; c.reason = reason; } return { ok: false, t, status }; }

function visit(c: Ctx, from: ArchNode, n: ArchNode, t: number): Out {
  if (c.path.includes(n.id)) { const o = fail(c, n, "cycle in the graph", t, 508); c.hops.push({ from: from.id, to: n.id, start: t, end: t, note: "cycle", ok: false }); return o; }
  const start = t; t += cost(n, c.rand);
  const record = (end: number, note: string, ok: boolean) => c.hops.push({ from: from.id, to: n.id, start, end, note, ok });
  if (n.down) { record(t, "down", false); return fail(c, n, `${n.label} is down`, t, n.kind === "lb" ? 503 : 502); }
  if (n.kind !== "client" && n.errorRate > 0 && c.rand() < n.errorRate) { record(t, "error", false); return fail(c, n, `${n.label} returned an error`, t, 500); }
  c.path.push(n.id);
  try {
    const next = outs(c.g, n.id);
    switch (n.kind) {
      case "cdn": {
        if (c.rand() < n.hitRate) { record(t, "hit", true); return { ok: true, t, status: 200 }; }
        record(t, "miss", true);
        if (!next.length) return fail(c, n, "CDN missed and has no origin", t, 502);
        return visit(c, n, next[0]!, t);
      }
      case "lb": {
        const healthy = next.filter((x) => !x.down);
        if (!healthy.length) { record(t, "no healthy target", false); return fail(c, n, "no healthy target behind the load balancer", t, 503); }
        const i = c.rr.get(n.id) ?? 0; c.rr.set(n.id, i + 1);
        const target = healthy[i % healthy.length]!;
        record(t, `-> ${target.label}`, true);
        return visit(c, n, target, t);
      }
      case "api": {
        record(t, "handle", true);
        let cur = t, served = false;
        for (const d of next) {
          if (served && d.kind === "db") continue;                        // a cache hit already answered
          if (d.kind === "queue") { const r = visit(c, n, d, cur); cur = r.t; if (!r.ok) return fail(c, n, c.reason ?? "queue failed", cur, 502); continue; }
          const before = { f: c.failedAt, r: c.reason };
          const r = visit(c, n, d, cur); cur = r.t;
          if (d.kind === "cache") {                                       // cache trouble is not fatal: forget it and fall through to storage
            if (!r.ok) { c.failedAt = before.f; c.reason = before.r; }
            else if (c.hops[c.hops.length - 1]?.note === "hit") { served = true; c.cacheHit = true; }
            continue;
          }
          if (!r.ok) return fail(c, n, c.reason ?? `${d.label} failed`, cur, 502);
          const cacheNode = next.find((x) => x.kind === "cache" && !x.down);
          if (cacheNode && d.kind === "db") { const wb = cost(cacheNode, c.rand); c.hops.push({ from: n.id, to: cacheNode.id, start: cur, end: cur + wb, note: "write-back", ok: true }); cur += wb; }
        }
        return { ok: true, t: cur, status: 200 };
      }
      case "cache": {
        const hit = c.rand() < n.hitRate;
        record(t, hit ? "hit" : "miss", true);
        return { ok: true, t, status: 200 };
      }
      case "queue": { record(t, "enqueued", true); return { ok: true, t, status: 202 }; }
      default: { // client, db, worker
        record(t, n.kind === "db" ? "query" : "ok", true);
        let cur = t;
        for (const d of next) { const r = visit(c, n, d, cur); cur = r.t; if (!r.ok) return r; }
        return { ok: true, t: cur, status: 200 };
      }
    }
  } finally { c.path.pop(); }
}

export function simulateRequest(g: Graph, rand: () => number, rr: Map<string, number> = new Map()): RequestResult {
  const client = g.nodes.find((n) => n.kind === "client");
  const c: Ctx = { g, rand, rr, hops: [], path: [], cacheHit: false, failedAt: null, reason: null };
  if (!client) return { ok: false, total: 0, status: 0, hops: [], cacheHit: false, failedAt: null, reason: "no client" };
  const first = outs(g, client.id)[0];
  if (!first) return { ok: false, total: 0, status: 0, hops: [], cacheHit: false, failedAt: client.id, reason: "client is not connected" };
  c.path.push(client.id);
  const r = visit(c, client, first, 0);
  // Latency is the time until the answer exists; the return trip is not modelled separately.
  return { ok: r.ok, status: r.status, total: r.t, hops: c.hops, cacheHit: c.cacheHit, failedAt: r.ok ? null : c.failedAt, reason: r.ok ? null : c.reason };
}

export interface Stats { n: number; ok: number; successRate: number; mean: number; p50: number; p95: number; p99: number; cacheHitRate: number; failuresBy: Record<string, number>; statuses: Record<string, number> }
const pct = (xs: number[], p: number) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0;

export function simulateMany(g: Graph, n: number, seed = 1): Stats {
  const rand = rng(seed); const rr = new Map<string, number>();
  const lat: number[] = []; const failuresBy: Record<string, number> = {}; const statuses: Record<string, number> = {};
  let ok = 0, hits = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateRequest(g, rand, rr);
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (r.ok) { ok++; lat.push(r.total); if (r.cacheHit) hits++; } else if (r.failedAt) failuresBy[r.failedAt] = (failuresBy[r.failedAt] ?? 0) + 1;
  }
  lat.sort((a, b) => a - b);
  return { n, ok, successRate: n ? ok / n : 0, mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0, p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), cacheHitRate: ok ? hits / ok : 0, failuresBy, statuses };
}

export const PRESETS: { id: string; name: string; blurb: string; graph: Graph }[] = (() => {
  const N = makeNode;
  const e = (a: string, b: string): ArchEdge => ({ id: `${a}->${b}`, from: a, to: b });
  return [
    { id: "simple", name: "API + database", blurb: "The smallest backend: every request hits the database.", graph: { nodes: [N("c", "client"), N("a", "api", "API"), N("d", "db", "Database")], edges: [e("c", "a"), e("a", "d")] } },
    { id: "cached", name: "Add a cache", blurb: "Cache-aside in front of the database. Watch p50 drop and the tail stay.", graph: { nodes: [N("c", "client"), N("a", "api", "API"), N("k", "cache", "Cache"), N("d", "db", "Database")], edges: [e("c", "a"), e("a", "k"), e("a", "d")] } },
    { id: "lb", name: "Load-balanced APIs", blurb: "Two API servers behind a balancer. Take one down and see what survives.", graph: { nodes: [N("c", "client"), N("l", "lb", "Load balancer"), N("a1", "api", "API 1"), N("a2", "api", "API 2"), N("d", "db", "Database")], edges: [e("c", "l"), e("l", "a1"), e("l", "a2"), e("a1", "d"), e("a2", "d")] } },
    { id: "async", name: "Queue + worker", blurb: "Slow work moves off the request path: the user only pays the enqueue.", graph: { nodes: [N("c", "client"), N("a", "api", "API"), N("d", "db", "Database"), N("q", "queue", "Queue"), N("w", "worker", "Worker")], edges: [e("c", "a"), e("a", "d"), e("a", "q"), e("q", "w")] } },
  ];
})();

export interface Saved { nodes: (ArchNode & { x: number; y: number })[]; edges: ArchEdge[] }
const clamp = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
/** Shape untrusted saved data (localStorage) into a valid layout; anything malformed is dropped, never repaired. Returns null if nothing usable. */
export function sanitizeSaved(x: unknown): Saved | null {
  if (!x || typeof x !== "object") return null;
  const raw = x as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  const nodes: Saved["nodes"] = []; const ids = new Set<string>();
  for (const n of raw.nodes.slice(0, 40)) {
    const o = n as Partial<ArchNode & { x: number; y: number }>;
    if (!o || typeof o.id !== "string" || !/^[\w-]{1,30}$/.test(o.id) || ids.has(o.id) || typeof o.kind !== "string" || !(o.kind in KINDS)) continue;
    ids.add(o.id);
    nodes.push({ id: o.id, kind: o.kind as Kind, label: typeof o.label === "string" ? o.label.slice(0, 30) || KINDS[o.kind as Kind].label : KINDS[o.kind as Kind].label,
      latency: clamp(o.latency, 0, 5000, KINDS[o.kind as Kind].latency), hitRate: clamp(o.hitRate, 0, 1, KINDS[o.kind as Kind].hitRate), errorRate: clamp(o.errorRate, 0, 1, KINDS[o.kind as Kind].errorRate),
      ...(typeof o.capacity === "number" && Number.isFinite(o.capacity) ? { capacity: Math.min(10_000, Math.max(0, Math.round(o.capacity))) } : {}),
      down: o.down === true, x: clamp(o.x, -5000, 5000, 0), y: clamp(o.y, -5000, 5000, 0) });
  }
  const edges: ArchEdge[] = [];
  for (const e of raw.edges.slice(0, 100)) {
    const o = e as Partial<ArchEdge>;
    if (o && typeof o.from === "string" && typeof o.to === "string" && ids.has(o.from) && ids.has(o.to) && o.from !== o.to && !edges.some((k) => k.from === o.from && k.to === o.to)) edges.push({ id: `${o.from}->${o.to}`, from: o.from, to: o.to });
  }
  return nodes.length ? { nodes, edges } : null;
}
