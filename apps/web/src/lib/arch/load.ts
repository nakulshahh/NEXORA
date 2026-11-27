/**
 * Load model for the architecture builder and the Break-it Lab: many requests arriving over time, finite capacity, queues,
 * timeouts, retries, timed faults and the usual defences. A discrete-event simulation over the SAME per-request paths
 * simulateRequest produces, so a single trace and a load test always agree about what a request does; this file adds *when*.
 *
 * Model (also shown in the UI):
 *  - Arrivals are Poisson at `rps` (seeded). Each arrival samples a path (cache hits, errors, load-balancer choice) as one trace would,
 *    against the graph as it is at that moment (faults applied).
 *  - A node with capacity c serves at most c requests at once; others wait in a FIFO queue (bounded by `queueLimit`, else unbounded).
 *  - An API server holds its slot for the WHOLE request, including time spent waiting for the database or cache (thread-per-request).
 *    This is what turns one slow dependency into a full outage.
 *  - The client gives up after `timeoutMs` and may retry with exponential backoff (optionally jittered). The abandoned request keeps
 *    running on the servers (zombie work). An optional circuit breaker makes the client fail fast instead of piling on.
 *  - `callTimeoutMs`: the API stops waiting for a downstream call after this long, frees its slot and returns 502.
 *  - A queue node accepts instantly; its workers drain it with their own capacity. A backlog shows as the worker's queue length.
 * Faults: down, slow (latency x value), errors (error rate = value), blackhole (accepts calls, never answers), pause (stops serving, keeps
 * the queue), cache-cold (hit rate 0 during the fault, then ramps back over `value` seconds).
 * Not modelled: service times that grow with load (contention, GC), connection setup, partial failures, geography, correlated client behaviour.
 */
import { rng, simulateRequest, type ArchNode, type Graph, type Hop } from "./sim.ts";

export const DEFAULT_CAPACITY: Record<ArchNode["kind"], number> = { client: 0, cdn: 0, lb: 0, api: 8, cache: 200, db: 10, queue: 0, worker: 4 };
export const capacityOf = (n: ArchNode) => (n.capacity && n.capacity > 0 ? Math.round(n.capacity) : DEFAULT_CAPACITY[n.kind]);

export type FaultKind = "down" | "slow" | "errors" | "blackhole" | "pause" | "cache-cold";
export interface Fault { node: string; kind: FaultKind; /** seconds */ at: number; until: number; value?: number }
export interface Breaker { failures: number; cooldownMs: number }
export interface LoadParams {
  rps: number; seconds: number; timeoutMs: number; retries: number; backoffMs: number; seed: number;
  jitter?: boolean; breaker?: Breaker | null; queueLimit?: number; callTimeoutMs?: number; faults?: Fault[];
}
export const LOAD_DEFAULTS: LoadParams = { rps: 100, seconds: 20, timeoutMs: 1000, retries: 0, backoffMs: 100, seed: 1 };

export interface NodeLoad { util: number; maxQueue: number; served: number }
export type LogLevel = "info" | "warn" | "error";
export interface LoadEvent { t: number; level: LogLevel; msg: string }
export interface Second { t: number; offered: number; ok: number; bad: number; p95: number; queues: Record<string, number> }
export interface LoadResult {
  logical: number; attempts: number; ok: number; failed: number; timedOut: number; shed: number; fastFailed: number; callTimeouts: number;
  goodput: number; offered: number; amplification: number; successRate: number;
  p50: number; p95: number; p99: number;
  nodes: Record<string, NodeLoad>;
  timeline: Second[];
  events: LoadEvent[];
  endTime: number;
  /** Seconds during which requests arrived (the timeline continues after this while the system drains). */
  horizon: number;
}

interface Ev { t: number; seq: number; run: () => void }
class Heap {
  private a: Ev[] = [];
  get size() { return this.a.length; }
  push(e: Ev) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.lt(a[i]!, a[p]!)) { [a[i], a[p]] = [a[p]!, a[i]!]; i = p; } else break; } }
  pop(): Ev {
    const a = this.a, top = a[0]!, last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.lt(a[l]!, a[m]!)) m = l; if (r < a.length && this.lt(a[r]!, a[m]!)) m = r; if (m === i) break; [a[i], a[m]] = [a[m]!, a[i]!]; i = m; } }
    return top;
  }
  private lt(x: Ev, y: Ev) { return x.t < y.t || (x.t === y.t && x.seq < y.seq); }
}
interface Pool { cap: number; baseCap: number; busy: number; q: ((release: () => void) => void)[]; busyTime: number; maxQ: number; served: number }
interface Logical { start: number; done: boolean }
const pctl = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0);
const HANG_MS = 60_000;

export function simulateLoad(g: Graph, p: LoadParams): LoadResult {
  const rand = rng(p.seed), rr = new Map<string, number>(), heap = new Heap();
  const faults = p.faults ?? [], queueLimit = p.queueLimit ?? 0, callTimeout = p.callTimeoutMs ?? 0, breaker = p.breaker ?? null;
  const node = new Map(g.nodes.map((n) => [n.id, n]));
  const pools = new Map<string, Pool>();
  for (const n of g.nodes) { const cap = capacityOf(n); if (cap > 0) pools.set(n.id, { cap, baseCap: cap, busy: 0, q: [], busyTime: 0, maxQ: 0, served: 0 }); }
  let seq = 0, now = 0;
  const at = (t: number, run: () => void) => heap.push({ t, seq: seq++, run });
  const nm = (id: string) => node.get(id)?.label ?? id;
  const events: LoadEvent[] = [];
  const log = (level: LogLevel, msg: string) => { if (events.length < 600) events.push({ t: now, level, msg }); };

  // ---- graph as of time t (faults that change a node's own behaviour) ----
  const graphCache = new Map<string, Graph>();
  const rampOf = (f: Fault, ts: number) => (f.kind === "cache-cold" ? (ts < f.until ? 0 : (f.value ?? 0) > 0 ? Math.min(1, (ts - f.until) / (f.value ?? 1)) : 1) : 1);
  function graphAt(tSec: number): Graph {
    const act = faults.filter((f) => (f.kind === "down" || f.kind === "slow" || f.kind === "errors" || f.kind === "cache-cold") && tSec >= f.at && tSec < f.until + (f.kind === "cache-cold" ? (f.value ?? 0) : 0));
    if (!act.length) return g;
    const key = act.map((f) => `${faults.indexOf(f)}:${f.kind === "cache-cold" ? Math.round(rampOf(f, tSec) * 10) : 0}`).join(",");
    let h = graphCache.get(key);
    if (!h) {
      h = { nodes: g.nodes.map((n) => ({ ...n })), edges: g.edges };
      for (const f of act) {
        const n = h.nodes.find((x) => x.id === f.node); if (!n) continue;
        if (f.kind === "down") n.down = true;
        else if (f.kind === "slow") n.latency *= f.value ?? 4;
        else if (f.kind === "errors") n.errorRate = Math.max(n.errorRate, f.value ?? 0.5);
        else n.hitRate = n.hitRate * rampOf(f, tSec);
      }
      graphCache.set(key, h);
    }
    return h;
  }
  const blackholed = (id: string) => faults.some((f) => f.kind === "blackhole" && f.node === id && now / 1000 >= f.at && now / 1000 < f.until);

  // ---- pools ----
  const drain = (pool: Pool) => { while (pool.busy < pool.cap && pool.q.length) { const start = pool.q.shift()!; start(mkRelease(pool)); } };
  function mkRelease(pool: Pool) { pool.busy++; const t0 = now; let done = false; return () => { if (done) return; done = true; pool.busy--; pool.served++; pool.busyTime += now - t0; drain(pool); }; }
  /** Wait for a slot at `nodeId`. `start` receives the release function. Rejects at once if the bounded queue is full. */
  function acquire(nodeId: string, start: (release: () => void) => void, reject: () => void) {
    const pool = pools.get(nodeId);
    if (!pool) { start(() => {}); return; }
    if (pool.busy < pool.cap) { start(mkRelease(pool)); return; }
    if (queueLimit > 0 && pool.q.length >= queueLimit) { reject(); return; }
    pool.q.push(start); if (pool.q.length > pool.maxQ) pool.maxQ = pool.q.length;
  }
  for (const f of faults) if (f.kind === "pause") {
    const pool = pools.get(f.node); if (!pool) continue;
    at(f.at * 1000, () => { pool.cap = 0; log("error", `${nm(f.node)} paused: no new work is started`); });
    at(f.until * 1000, () => { pool.cap = pool.baseCap; log("info", `${nm(f.node)} resumed`); drain(pool); });
  }
  for (const f of faults) if (f.kind !== "pause") {
    const what = { down: "is DOWN", slow: `is slow (x${f.value ?? 4} latency)`, errors: `returns errors (${Math.round((f.value ?? 0.5) * 100)}%)`, blackhole: "stops answering (connections hang)", "cache-cold": "lost its contents (hit rate 0)" }[f.kind];
    at(f.at * 1000, () => log("error", `FAULT ${nm(f.node)} ${what}`));
    at(f.until * 1000, () => log("info", `FAULT ENDED ${nm(f.node)} ${f.kind === "cache-cold" && (f.value ?? 0) > 0 ? `refilling over ${f.value}s` : "recovered"}`));
  }

  // ---- bookkeeping ----
  const buckets = new Map<number, { offered: number; ok: number; bad: number; lat: number[]; queues: Record<string, number> }>();
  const bucket = (t: number) => { const k = Math.floor(t / 1000); let b = buckets.get(k); if (!b) { b = { offered: 0, ok: 0, bad: 0, lat: [], queues: {} }; buckets.set(k, b); } return b; };
  const lat: number[] = [];
  let logical = 0, attempts = 0, ok = 0, failed = 0, timedOut = 0, shed = 0, fastFailed = 0, callTimeouts = 0;
  let consecutiveFails = 0, openUntil = 0, announcedBacklog = new Set<string>();

  const workersOf = (queueId: string) => g.edges.filter((e) => e.from === queueId).map((e) => node.get(e.to)).filter((n): n is ArchNode => !!n && n.kind === "worker");

  function attempt(lg: Logical, no: number) {
    attempts++; bucket(now).offered++;
    if (breaker && now < openUntil) {
      fastFailed++; bucket(now).bad++;
      if (!lg.done) { lg.done = true; failed++; }
      return;
    }
    const begin = now, r = simulateRequest(graphAt(now / 1000), rand, rr);
    const hops: Hop[] = r.hops.filter((h) => h.note !== "cycle");
    let resolved = false, aborted = false, release: (() => void) | null = null;
    const freeSlot = () => { if (release) { const f = release; release = null; f(); } };
    const finish = (good: boolean, why: "done" | "timeout" | "shed" | "call-timeout") => {
      if (resolved) return; resolved = true;
      const b = bucket(now);
      if (good) {
        b.ok++; consecutiveFails = 0;
        if (!lg.done) { lg.done = true; ok++; lat.push(now - lg.start); b.lat.push(now - lg.start); }
        return;
      }
      b.bad++;
      if (why === "timeout") { timedOut++; if (timedOut === 1) log("warn", `first client timeout after ${p.timeoutMs} ms`); }
      if (why === "shed") shed++;
      if (why === "call-timeout") callTimeouts++;
      if (breaker && ++consecutiveFails >= breaker.failures && now >= openUntil) {
        openUntil = now + breaker.cooldownMs; consecutiveFails = breaker.failures - 1;
        log("warn", `circuit breaker OPEN for ${breaker.cooldownMs} ms: failing fast instead of calling the backend`);
        at(openUntil, () => log("info", "circuit breaker half-open: letting requests through again"));
      }
      if (lg.done) return;
      if (no < p.retries) { const base = p.backoffMs * 2 ** no; at(now + Math.max(1, p.jitter ? rand() * base : base), () => attempt(lg, no + 1)); }
      else { lg.done = true; failed++; }
    };
    at(begin + p.timeoutMs, () => finish(false, "timeout"));

    const run = (i: number) => {
      if (aborted) return;
      if (i >= hops.length) { freeSlot(); finish(r.ok, "done"); return; }
      const h = hops[i]!, n = node.get(h.to);
      let dur = h.end - h.start;
      if (blackholed(h.to)) dur = HANG_MS;
      const finishHop = () => {
        if (h.note === "enqueued") for (const w of workersOf(h.to)) acquire(w.id, (rel) => { at(now + w.latency * (0.8 + 0.4 * rand()) + 1, () => rel()); }, () => {});
        run(i + 1);
      };
      if (n?.kind === "api" && h.note === "handle") {
        acquire(h.to, (rel) => { release = rel; at(now + dur, () => run(i + 1)); }, () => { freeSlot(); finish(false, "shed"); });
        return;
      }
      let settled = false;
      const go = () => { if (settled || aborted) return; settled = true; finishHop(); };
      if (release && callTimeout > 0) at(now + callTimeout, () => { if (settled) return; settled = true; aborted = true; freeSlot(); finish(false, "call-timeout"); });
      if (dur === HANG_MS) at(now + dur, go);
      else acquire(h.to, (rel) => { at(now + dur, () => { rel(); go(); }); }, () => { if (settled) return; settled = true; aborted = true; freeSlot(); finish(false, "shed"); });
    };
    run(0);
  }

  // Poisson arrivals, generated up front so the stream is identical whatever the capacities and faults are.
  let t = 0; const horizon = p.seconds * 1000;
  for (;;) { t += (-Math.log(1 - rand()) / p.rps) * 1000; if (t >= horizon) break; const lg: Logical = { start: t, done: false }; logical++; const when = t; at(when, () => attempt(lg, 0)); }

  // Once a second: snapshot every queue (this is the chart of "what is backing up") and note big backlogs in the log.
  const tick = (k: number) => at(k * 1000, () => {
    const b = bucket(k * 1000);
    for (const [id, pool] of pools) {
      b.queues[id] = pool.q.length;
      if (pool.q.length >= 50 && !announcedBacklog.has(id)) { announcedBacklog.add(id); log("warn", `${nm(id)} has ${pool.q.length} requests waiting (${pool.busy}/${pool.cap} busy)`); }
      if (pool.q.length === 0 && announcedBacklog.has(id)) { announcedBacklog.delete(id); log("info", `${nm(id)} queue drained`); }
    }
    if (heap.size > 0) tick(k + 1);
  });
  tick(0);

  let guard = 0;
  while (heap.size && guard++ < 8_000_000) { const e = heap.pop(); now = e.t; e.run(); }

  lat.sort((a, b) => a - b);
  const end = Math.max(now, horizon), nodes: Record<string, NodeLoad> = {};
  for (const [id, pool] of pools) nodes[id] = { util: Math.min(1, pool.busyTime / (pool.baseCap * end)), maxQueue: pool.maxQ, served: pool.served };
  const timeline: Second[] = Array.from({ length: Math.ceil(end / 1000) }, (_, k) => {
    const b = buckets.get(k); const l = b ? b.lat.sort((x, y) => x - y) : [];
    return { t: k, offered: b?.offered ?? 0, ok: b?.ok ?? 0, bad: b?.bad ?? 0, p95: pctl(l, 0.95), queues: b?.queues ?? {} };
  });
  events.sort((a, b) => a.t - b.t);
  return {
    logical, attempts, ok, failed, timedOut, shed, fastFailed, callTimeouts, goodput: ok / p.seconds, offered: attempts / p.seconds, amplification: logical ? attempts / logical : 1, successRate: logical ? ok / logical : 0,
    p50: pctl(lat, 0.5), p95: pctl(lat, 0.95), p99: pctl(lat, 0.99), nodes, timeline, events, endTime: end, horizon: p.seconds,
  };
}

/** Rough ceiling on requests/second a node can serve: capacity / mean time a request occupies a slot. Own service time only. */
export function nodeCeiling(n: ArchNode): number | null { const c = capacityOf(n); return c > 0 && n.latency > 0 ? (c * 1000) / (n.latency + 1) : null; }
/** Ceiling for an API server, which also holds its slot while its downstream calls run (sum of their latencies, cache misses weighted). */
export function heldCeiling(g: Graph, n: ArchNode): number | null {
  const c = capacityOf(n); if (c <= 0) return null;
  const outs = g.edges.filter((e) => e.from === n.id).map((e) => g.nodes.find((x) => x.id === e.to)!).filter(Boolean);
  const cache = outs.find((x) => x.kind === "cache");
  let hold = n.latency + 1;
  for (const d of outs) { if (d.kind === "queue") hold += d.latency + 1; else if (d.kind === "cache") hold += d.latency + 1; else hold += (d.latency + 1) * (cache ? 1 - cache.hitRate : 1) + (cache && d.kind === "db" ? (cache.latency + 1) * (1 - cache.hitRate) : 0); }
  return (c * 1000) / hold;
}
