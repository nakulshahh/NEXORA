import { rng, type ParamDef, type Params, type SimSpec, type Step } from "./engine.ts";
import type { GenericState } from "./generic.ts";

const KEYS = 10, REQUESTS = 24;
const params: ParamDef[] = [
  { key: "policy", label: "Eviction policy", kind: "select", options: [{ value: "lru", label: "LRU (least recently used)" }, { value: "fifo", label: "FIFO (oldest in)" }, { value: "lfu", label: "LFU (least frequently used)" }] },
  { key: "workload", label: "Access pattern", kind: "select", options: [{ value: "skewed", label: "Skewed (a few hot keys)" }, { value: "uniform", label: "Uniform random" }, { value: "loop", label: "Loop over 5 keys" }] },
  { key: "capacity", label: "Cache capacity", kind: "range", min: 2, max: 6, step: 1, unit: "keys" },
];
const defaults: Params = { policy: "lru", workload: "skewed", capacity: 3 };

/** The request stream is a pure function of (workload, seed), so policies can be compared on identical input. */
export function requests(workload: string, seed: number): number[] {
  const r = rng(seed), out: number[] = [];
  if (workload === "loop") { for (let i = 0; i < REQUESTS; i++) out.push(i % 5); return out; }
  const w = Array.from({ length: KEYS }, (_, k) => (workload === "skewed" ? 1 / (k + 1) : 1)), tot = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < REQUESTS; i++) { let x = r() * tot, k = 0; while (k < KEYS - 1 && x >= w[k]!) { x -= w[k]!; k++; } out.push(k); }
  return out;
}

interface Slot { key: number; at: number; used: number; freq: number }
export function cacheScenario(p: Params, seed: number): Step<GenericState>[] {
  const cap = Number(p.capacity), policy = String(p.policy), reqs = requests(String(p.workload), seed), out: Step<GenericState>[] = [];
  let slots: Slot[] = [], hits = 0, misses = 0;
  const view = (title: string, line: string, mark?: { key: number; tone: "hit" | "miss" | "evict" }): GenericState => ({
    title: `Cache (capacity ${cap})`, line,
    cells: Array.from({ length: cap }, (_, i) => { const s = slots[i]; return s ? { label: `key ${s.key}`, sub: policy === "lfu" ? `used ${s.freq}x` : policy === "lru" ? `last use t${s.used}` : `in at t${s.at}`, tone: mark && mark.key === s.key ? mark.tone : "visit" } : { label: "empty", tone: "idle" as const }; }),
    metrics: [{ label: "Hits", value: String(hits) }, { label: "Misses", value: String(misses) }, { label: "Hit ratio", value: `${Math.round((hits / Math.max(1, hits + misses)) * 100)}%` }],
  });
  out.push({ id: "start", label: "Empty cache", explain: `A cache of ${cap} slots in front of a slow source of ${p.workload === "loop" ? 5 : KEYS} keys. ${REQUESTS} requests follow, identical for every policy at this seed.`, ms: 0.1, state: view("", "cache empty") });
  reqs.forEach((k, t) => {
    const i = slots.findIndex((s) => s.key === k);
    if (i >= 0) {
      hits++; slots[i]!.used = t; slots[i]!.freq++;
      out.push({ id: `r${t}`, label: `Request key ${k}: hit`, explain: `Key ${k} is cached, so the slow source is not touched. This is the whole point of a cache.`, ms: 0.5, state: view("", `t${t} GET ${k} -> HIT`, { key: k, tone: "hit" }) });
      return;
    }
    misses++;
    let note = `Key ${k} is not cached, so the slow source is asked and the result stored.`, victim: Slot | undefined;
    if (slots.length >= cap) {
      const rank = (s: Slot) => (policy === "lru" ? s.used : policy === "fifo" ? s.at : s.freq * 1000 + s.used);
      victim = slots.reduce((a, b) => (rank(b) < rank(a) ? b : a));
      note += ` The cache is full; ${policy.toUpperCase()} evicts key ${victim.key} (${policy === "lru" ? "untouched the longest" : policy === "fifo" ? "inserted first" : "used least often"}).`;
      slots = slots.filter((s) => s !== victim);
    }
    slots.push({ key: k, at: t, used: t, freq: 1 });
    out.push({ id: `r${t}`, label: `Request key ${k}: miss${victim ? `, evict ${victim.key}` : ""}`, explain: note, ms: 5, state: view("", `t${t} GET ${k} -> MISS${victim ? ` (evict ${victim.key})` : ""}`, { key: k, tone: victim ? "evict" : "miss" }) });
  });
  return out;
}
export const CACHE_SPEC: SimSpec<GenericState> = {
  id: "cache", title: "Cache hit / miss / evict", params, defaults, scenario: cacheScenario,
  simplifies: ["Keys are small integers and every entry costs one slot; real caches evict by memory size.", "No expiry (TTL) and no invalidation: only capacity pressure removes entries.", "Real Redis approximates LRU and LFU by sampling instead of tracking exact order.", "Hit costs 0.5 ms and miss 5 ms are illustrative."],
};
