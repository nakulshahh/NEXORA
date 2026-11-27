/**
 * Break-it Lab scenarios. Each one is an incident with a cause the learner must find and a fix they must prove by re-running.
 * Everything here is data over the load model in load.ts: a graph, a load, timed faults, a pass condition (SLO),
 * the root-cause question, a ladder of hints, and reference fixes plus tempting wrong fixes (both are tested).
 */
import { LOAD_DEFAULTS, simulateLoad, type Breaker, type Fault, type LoadEvent, type LoadParams, type LoadResult } from "./load.ts";
import { makeNode, type ArchEdge, type ArchNode, type Graph } from "./sim.ts";

export interface Setup { graph: Graph; load: LoadParams }
export interface Slo { minSuccess?: number; maxP95?: number; maxBacklog?: number; recoverBySec?: number }
export interface Check { label: string; value: string; limit: string; ok: boolean }
export interface Fix { name: string; apply: (s: Setup) => void }
export interface Incident {
  id: string; title: string; chapter: string; difficulty: 1 | 2 | 3;
  /** What the on-call engineer is told. Symptoms only: no cause. */
  page: string;
  slo: Slo; sloText: string;
  question: string; choices: string[]; answer: number; rootCause: string;
  hints: string[];
  setup: () => Setup;
  fixes: Fix[]; wrongFixes: Fix[];
}

const e = (a: string, b: string): ArchEdge => ({ id: `${a}->${b}`, from: a, to: b });
const node = (id: string, kind: ArchNode["kind"], label: string, o: Partial<ArchNode> = {}): ArchNode => ({ ...makeNode(id, kind, label), ...o });
/** client -> LB -> two API servers -> (cache) -> database. Latencies: API 15 ms, DB 12 ms, cache 1 ms. */
export function webGraph(o: { cacheHit?: number; dbCap?: number; apiCap?: number; worker?: boolean; workerCap?: number } = {}): Graph {
  const nodes: ArchNode[] = [node("c", "client", "Client"), node("l", "lb", "Load balancer"), node("a1", "api", "API 1", { capacity: o.apiCap ?? 8, errorRate: 0 }), node("a2", "api", "API 2", { capacity: o.apiCap ?? 8, errorRate: 0 }), node("d", "db", "Database", { capacity: o.dbCap ?? 10, errorRate: 0 })];
  const edges = [e("c", "l"), e("l", "a1"), e("l", "a2")];
  if (o.cacheHit !== undefined) { nodes.push(node("k", "cache", "Cache", { hitRate: o.cacheHit })); edges.push(e("a1", "k"), e("a2", "k")); }
  edges.push(e("a1", "d"), e("a2", "d"));
  if (o.worker) { nodes.push(node("q", "queue", "Queue"), node("w", "worker", "Worker", { capacity: o.workerCap ?? 4 })); edges.push(e("a1", "q"), e("a2", "q"), e("q", "w")); }
  return { nodes, edges };
}
const load = (o: Partial<LoadParams> & { faults?: Fault[] }): LoadParams => ({ ...LOAD_DEFAULTS, seconds: 40, ...o });
export const byId = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)!;
const setCap = (id: string, cap: number) => (s: Setup) => { byId(s.graph, id).capacity = cap; };
const brk: Breaker = { failures: 5, cooldownMs: 1000 };

export const INCIDENTS: Incident[] = [
  {
    id: "node-failure", title: "One server dies", chapter: "C4", difficulty: 1,
    page: "At 00:10 error rates jumped and stayed high for 20 seconds. Both API servers show as 'healthy' on the dashboard except one, which is down. Traffic is a steady 300 requests per second. Users saw slow pages and failures, not a clean outage.",
    slo: { minSuccess: 0.97, maxP95: 200 }, sloText: "At least 97% of requests succeed and p95 latency stays under 200 ms, even while a server is down.",
    question: "Why did losing ONE of two servers hurt so much, when the other one was healthy?",
    choices: ["The load balancer is broken", "The remaining server cannot carry the whole load: capacity was sized for N servers, not N-1", "The database slowed down", "Clients retried too aggressively"],
    answer: 1,
    rootCause: "Each API server can only serve about 275 requests per second (8 slots, each held about 29 ms). Two servers handle 300 rps with room to spare; one cannot. When API 2 died, API 1 received everything, its queue grew without bound and requests timed out. Capacity must be planned for N-1.",
    hints: ["Look at the 'busy' and 'longest queue' columns: which component is saturated?", "Compare the capacity of one API server (inspector) with the load: about 275 req/s per server versus 300 req/s offered.", "Capacity has to be added to the survivor (or a third server), not to the database."],
    setup: () => ({ graph: webGraph(), load: load({ rps: 300, faults: [{ node: "a2", kind: "down", at: 10, until: 30 }] }) }),
    fixes: [{ name: "Give each API server twice the capacity (N+1 sizing)", apply: (x) => { setCap("a1", 16)(x); setCap("a2", 16)(x); } }],
    wrongFixes: [{ name: "Raise the client timeout to 5 s", apply: (x) => { x.load.timeoutMs = 5000; } }, { name: "Add retries", apply: (x) => { x.load.retries = 3; } }, { name: "Make the database bigger", apply: setCap("d", 40) }],
  },
  {
    id: "slow-dependency", title: "The database gets slow", chapter: "B9", difficulty: 2,
    page: "At 00:10 the database's response time went up about 8x (a bad query plan after a deploy). It never went fully down. Within seconds the whole site stopped answering, including pages that barely touch the database. CPU on the API servers is low.",
    slo: { minSuccess: 0.95, maxP95: 400 }, sloText: "At least 95% succeed and p95 stays under 400 ms during a database slowdown.",
    question: "The database is only slow, not down. Why did the API servers stop serving everything?",
    choices: ["Slow responses use a lot of API CPU", "Each API request holds a worker slot while it waits for the database, so slow queries use up all the slots", "The load balancer removes slow servers", "The network is saturated"],
    answer: 1,
    rootCause: "An API server holds its slot for the whole request, including the wait on the database. At 8x latency each request now holds a slot for about 100 ms instead of 13, so the same 16 slots serve about a seventh of the traffic. Low CPU is the clue: the servers are waiting, not working. Fail-fast settings (call timeouts, bounded queues) bound the damage; real capacity or less database work fixes it.",
    hints: ["The API's CPU is low but its queue is long. What are its slots doing?", "Estimate slot-time per request: API time + database time. How did it change when the database slowed?", "More slots (capacity) cover the longer wait. Fail-fast settings help latency but cannot create capacity."],
    setup: () => ({ graph: webGraph(), load: load({ rps: 200, faults: [{ node: "d", kind: "slow", at: 10, until: 30, value: 8 }] }) }),
    fixes: [{ name: "More worker slots on both API servers and more database connections", apply: (x) => { setCap("a1", 32)(x); setCap("a2", 32)(x); setCap("d", 40)(x); } }],
    wrongFixes: [{ name: "Retry failed requests 3 times", apply: (x) => { x.load.retries = 3; } }, { name: "Only fail fast: 150 ms call timeout and a short queue", apply: (x) => { x.load.callTimeoutMs = 150; x.load.queueLimit = 20; } }],
  },
  {
    id: "db-down", title: "The database goes down", chapter: "B6", difficulty: 1,
    page: "At 00:10 the primary database became unreachable for 20 seconds. Reads hit a cache that was supposed to protect us, yet about two thirds of requests failed anyway. The cache is healthy.",
    slo: { minSuccess: 0.9 }, sloText: "At least 90% of requests succeed during a 20 s database outage (reads are served from cache).",
    question: "The cache was healthy. Why did most requests still fail?",
    choices: ["The cache is configured with too few entries and rarely has the answer: its hit rate is only 30%", "Caches cannot serve requests when the database is down", "The API servers crashed", "The load balancer stopped routing"],
    answer: 0,
    rootCause: "A cache-aside cache only protects the database from the requests it can answer. With a 30% hit rate, 70% of requests still need the database and fail during the outage. A cache that holds the hot working set (here 90%) turns a database outage into a partial degradation for reads.",
    hints: ["Open the cache in the inspector. What is its hit rate?", "During the outage, only requests the cache can answer succeed. What share is that?", "Raise the cache's hit rate (larger cache, better keys, longer TTL)."],
    setup: () => ({ graph: webGraph({ cacheHit: 0.3 }), load: load({ rps: 150, faults: [{ node: "d", kind: "down", at: 10, until: 30 }] }) }),
    fixes: [{ name: "Hold the hot working set in cache: hit rate 90%", apply: (x) => { byId(x.graph, "k").hitRate = 0.9; } }],
    wrongFixes: [{ name: "Retry failed requests 3 times", apply: (x) => { x.load.retries = 3; } }, { name: "Double the API capacity", apply: (x) => { setCap("a1", 16)(x); setCap("a2", 16)(x); } }],
  },
  {
    id: "cache-stampede", title: "The cache is wiped", chapter: "B6", difficulty: 2,
    page: "A routine cache restart at 00:10 emptied it. Traffic is a steady 400 requests per second and the database normally sees only a trickle. For about 15 seconds the whole site returned errors and the database showed a long queue.",
    slo: { minSuccess: 0.95, maxP95: 500 }, sloText: "At least 95% succeed and p95 stays under 500 ms through a cache restart.",
    question: "What happened when the cache lost its contents?",
    choices: ["The cache refused connections", "Every request became a miss at once, so the database received about 10x its usual traffic and its queue exploded", "The API servers ran out of memory", "DNS stopped resolving"],
    answer: 1,
    rootCause: "With a 90% hit rate the database serves 1 request in 10. A cold cache sends all of them: 400 req/s onto a database that can do about 300. Its queue grows, requests pile up in the API servers holding slots, and the failure spreads upward (a cache stampede). Defences: a database that can survive a cold cache, admission control that sheds the excess, warming the cache before taking traffic, and coalescing duplicate misses.",
    hints: ["Which component shows the long queue, and what is its capacity compared to the load it now gets?", "Database ceiling is about 300 req/s with 4 connections. Cache-cold traffic to it is 400 req/s.", "Either give the database enough connections for a cold cache, or bound the queue so excess load is shed instead of piling up."],
    setup: () => ({ graph: webGraph({ cacheHit: 0.9, dbCap: 4 }), load: load({ rps: 400, faults: [{ node: "k", kind: "cache-cold", at: 10, until: 15, value: 10 }] }) }),
    fixes: [{ name: "Size the database for a cold cache (12 connections)", apply: setCap("d", 12) }, { name: "Shed load: bounded queues (10 waiting per component)", apply: (x) => { x.load.queueLimit = 10; } }],
    wrongFixes: [{ name: "Double the API capacity", apply: (x) => { setCap("a1", 16)(x); setCap("a2", 16)(x); } }, { name: "Retry failed requests 3 times", apply: (x) => { x.load.retries = 3; } }],
  },
  {
    id: "queue-backlog", title: "Emails arrive an hour late", chapter: "B7", difficulty: 1,
    page: "Pages load fast and the API reports no errors, but customers say confirmation emails take longer and longer to arrive. The worker dashboard shows jobs waiting, and the number keeps rising while traffic is steady at 150 requests per second.",
    slo: { minSuccess: 0.99, maxBacklog: 100 }, sloText: "The job backlog never exceeds 100 waiting jobs (and requests still succeed).",
    question: "Requests are healthy, yet the backlog grows without limit. What is the problem?",
    choices: ["The API is too slow", "Jobs are enqueued faster than the workers can process them: arrival rate exceeds worker throughput", "The queue lost messages", "The database is down"],
    answer: 1,
    rootCause: "Each job takes about 31 ms and there are 4 workers, so they can finish about 129 jobs/s. 150 are enqueued per second. The deficit (about 21/s) accumulates forever: the queue hid the mismatch while the request path stayed fast. Whenever arrivals exceed throughput, delay grows linearly with time. Scale workers, or reduce work per job.",
    hints: ["Compute worker throughput: slots divided by time per job.", "Compare it with the enqueue rate (every request enqueues one job).", "More worker slots, or faster jobs. The API and database are not the problem."],
    setup: () => ({ graph: webGraph({ worker: true }), load: load({ rps: 150, seconds: 30 }) }),
    fixes: [{ name: "Run 8 workers", apply: setCap("w", 8) }],
    wrongFixes: [{ name: "Double the API capacity", apply: (x) => { setCap("a1", 16)(x); setCap("a2", 16)(x); } }, { name: "Shorten the client timeout", apply: (x) => { x.load.timeoutMs = 300; } }],
  },
  {
    id: "retry-storm", title: "It never recovers", chapter: "B9", difficulty: 3,
    page: "A bad query made the database slow for only 4 seconds at 00:10. The query was fixed immediately. But the site stayed down for far longer than the original problem, and with the clients' 3 automatic retries it did not come back at all until traffic was cut. The database is healthy again.",
    slo: { minSuccess: 0.85, maxP95: 500, recoverBySec: 10 }, sloText: "At least 85% succeed, p95 stays under 500 ms, and the system is healthy again within 10 s of the fault ending.",
    question: "The trigger lasted 4 seconds. Why did the outage last so much longer?",
    choices: ["The database was never really fixed", "Retries multiply the offered load while the system is already overloaded, so it cannot drain its backlog: a self-sustaining retry storm", "The clients' clocks drifted", "The load balancer needs a restart"],
    answer: 1,
    rootCause: "While the database was slow, requests timed out and clients immediately retried, tripling the load on a system that was already past capacity. Timed-out requests keep running on the servers (zombie work), so the queue keeps growing even after the database is fast again. Offered load stays above capacity, so the failures that cause retries never stop. Break the loop: jittered backoff, a circuit breaker so clients stop calling a failing service, bounded queues, and fewer or no retries.",
    hints: ["Compare 'offered (incl. retries)' with the request rate: what is the retry amplification?", "Why does the system not recover once the database is fast again? What is still in the queues?", "Use jittered retries together with a circuit breaker (or no retries); a bounded queue also stops the pile-up."],
    setup: () => ({ graph: webGraph({ apiCap: 12 }), load: load({ rps: 300, timeoutMs: 400, retries: 3, backoffMs: 50, faults: [{ node: "d", kind: "slow", at: 10, until: 14, value: 6 }] }) }),
    fixes: [{ name: "Jittered backoff plus a circuit breaker", apply: (x) => { x.load.jitter = true; x.load.breaker = brk; } }, { name: "Bounded queues and a call timeout (fail fast), no retries", apply: (x) => { x.load.retries = 0; x.load.queueLimit = 20; x.load.callTimeoutMs = 200; } }],
    wrongFixes: [{ name: "Raise the client timeout to 5 s", apply: (x) => { x.load.timeoutMs = 5000; } }, { name: "Add more retries (5)", apply: (x) => { x.load.retries = 5; } }],
  },
  {
    id: "cascade", title: "A hung dependency takes everything down", chapter: "B9", difficulty: 3,
    page: "At 00:10 the database host stopped answering: connections open but nothing comes back (no errors, just silence) for 12 seconds. 80% of our requests are served by the cache and never need the database, yet the whole site went down and stayed down well after the database recovered.",
    slo: { minSuccess: 0.9, recoverBySec: 5 }, sloText: "At least 90% succeed and the site is healthy within 5 s of the database coming back.",
    question: "Most requests do not need the database. Why did they fail too?",
    choices: ["The cache expired", "Requests stuck waiting on the hung database hold API slots until none are left, so even cache hits find no free server: one slow dependency became total failure", "The load balancer crashed", "Cache and database share a network cable"],
    answer: 1,
    rootCause: "A hung dependency is worse than a dead one: it never errors, so callers wait. Each stuck request holds an API slot (60 s in this model, like an unbounded socket timeout), so within seconds every slot is held by requests waiting for the database and healthy cache-hit requests have nowhere to run. The fix is to bound every outbound call: a call timeout makes the API give up, free its slot and fail just the requests that need the database.",
    hints: ["Look at the API queue lengths and busy slots while the database is hung.", "What does a request waiting on a hung database hold, and for how long?", "Give the API a call timeout of about 100 ms so it releases the slot; add a breaker if you like."],
    setup: () => ({ graph: webGraph({ cacheHit: 0.8 }), load: load({ rps: 200, faults: [{ node: "d", kind: "blackhole", at: 10, until: 22 }] }) }),
    fixes: [{ name: "100 ms call timeout on downstream calls", apply: (x) => { x.load.callTimeoutMs = 100; } }, { name: "100 ms call timeout plus a circuit breaker", apply: (x) => { x.load.callTimeoutMs = 100; x.load.breaker = brk; } }],
    wrongFixes: [{ name: "Shorten the client timeout to 200 ms", apply: (x) => { x.load.timeoutMs = 200; } }, { name: "Double the API capacity", apply: (x) => { setCap("a1", 16)(x); setCap("a2", 16)(x); } }],
  },
];

export const incidentById = (id: string) => INCIDENTS.find((i) => i.id === id);
export const cloneSetup = (s: Setup): Setup => structuredClone(s);
export function runSetup(s: Setup): LoadResult { return simulateLoad(s.graph, s.load); }

/** Seconds after the last fault ends until three consecutive seconds reach 90% of what arrived (null = not within the run). */
export function recoverySeconds(r: LoadResult, faults: Fault[]): number | null {
  if (!faults.length) return 0;
  const last = Math.max(...faults.map((f) => f.until + (f.kind === "cache-cold" ? (f.value ?? 0) : 0)));
  for (let t = Math.ceil(last); t + 2 < r.horizon; t++) {
    const ok = [0, 1, 2].every((d) => { const x = r.timeline[t + d]!; return x.offered > 0 && x.ok >= 0.9 * x.offered; });
    if (ok) return t - Math.ceil(last);
  }
  return null;
}
export const peakBacklog = (r: LoadResult) => Math.max(0, ...Object.values(r.nodes).map((n) => n.maxQueue));

export function evaluate(slo: Slo, r: LoadResult, faults: Fault[]): { pass: boolean; checks: Check[] } {
  const checks: Check[] = [];
  if (slo.minSuccess !== undefined) checks.push({ label: "Requests that succeeded", value: `${(r.successRate * 100).toFixed(1)}%`, limit: `at least ${(slo.minSuccess * 100).toFixed(0)}%`, ok: r.successRate >= slo.minSuccess });
  if (slo.maxP95 !== undefined) checks.push({ label: "p95 latency", value: `${r.p95.toFixed(0)} ms`, limit: `under ${slo.maxP95} ms`, ok: r.p95 <= slo.maxP95 });
  if (slo.maxBacklog !== undefined) { const b = peakBacklog(r); checks.push({ label: "Longest queue", value: String(b), limit: `at most ${slo.maxBacklog}`, ok: b <= slo.maxBacklog }); }
  if (slo.recoverBySec !== undefined) { const rec = recoverySeconds(r, faults); checks.push({ label: "Time to recover after the fault", value: rec === null ? "did not recover" : `${rec} s`, limit: `within ${slo.recoverBySec} s`, ok: rec !== null && rec <= slo.recoverBySec }); }
  return { pass: checks.every((c) => c.ok), checks };
}

/** What an engineer would see in the logs: fault events from the run plus one summary line per interesting second. */
export function buildLog(r: LoadResult, g: Graph): LoadEvent[] {
  const name = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id;
  const out: LoadEvent[] = r.events.map((e) => ({ ...e }));
  for (const s of r.timeline) {
    if (s.offered === 0 && s.ok === 0) continue;
    const bad = s.offered > 0 ? 1 - s.ok / s.offered : 0;
    const waiting = Object.entries(s.queues).filter(([, n]) => n >= 5).map(([id, n]) => `${name(id)}=${n}`).join(" ");
    const notable = bad > 0.1 || waiting !== "" || s.t % 5 === 0;
    if (!notable) continue;
    out.push({ t: s.t * 1000 + 999, level: bad > 0.5 ? "error" : bad > 0.1 || waiting ? "warn" : "info", msg: `t=${s.t}s ${s.offered} arrived, ${s.ok} ok${s.ok ? `, p95 ${s.p95.toFixed(0)} ms` : ""}${waiting ? ` | waiting: ${waiting}` : ""}` });
  }
  return out.sort((a, b) => a.t - b.t);
}
export type NodeStatus = "ok" | "busy" | "saturated" | "fault";
/** Colour-independent state of one component during second `t`: the lab's scrubbable picture of the incident. */
export function nodeStatus(r: LoadResult, faults: Fault[], id: string, t: number): { status: NodeStatus; queue: number; fault?: Fault } {
  const f = faults.find((x) => x.node === id && t >= x.at && t < x.until);
  const queue = r.timeline[Math.min(t, r.timeline.length - 1)]?.queues[id] ?? 0;
  if (f) return { status: "fault", queue, fault: f };
  return { status: queue >= 50 ? "saturated" : queue >= 5 ? "busy" : "ok", queue };
}
