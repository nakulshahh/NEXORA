/**
 * Concurrency Arena engine. Pure TypeScript (same rules as the rest of /sim: no React, DOM, clock or random source).
 *
 * A tiny deterministic machine: each thread is a short program over shared variables, locks and semaphores.
 * Nothing runs by itself. A *schedule* (a list of thread ids, one per step) decides the interleaving, so a
 * "race" is just a particular schedule. That makes every bug reproducible, replayable, and exhaustively checkable.
 */
import { rng } from "./engine.ts";

type Op =
  | { op: "load"; r: string; v: string }
  | { op: "store"; v: string; r: string }
  | { op: "add"; r: string; k: number }
  | { op: "fadd"; v: string; k: number }
  | { op: "lock"; m: string }
  | { op: "unlock"; m: string }
  | { op: "wait"; s: string }
  | { op: "post"; s: string }
  | { op: "brlt"; r: string; k: number; to: number }
  | { op: "check"; r: string; cmp: "ge" | "lt"; k: number; msg: string }
  | { op: "nop"; note: string };
/** `cs` marks the first ("enter") and last ("exit") instruction of the critical section the programmer intends. */
export type Instr = Op & { cs?: "enter" | "exit" };

export interface Machine {
  prog: Instr[][];
  names: string[];
  vars: Record<string, number>;
  locks: Record<string, number | null>;
  sems: Record<string, number>;
  pcs: number[];
  regs: Record<string, number>[];
  inCs: boolean[];
  tick: number;
  violations: string[];
  log: Ev[];
}
export interface Ev { tick: number; tid: number; pc: number; text: string; effect: string; kind: Kind }
export type Kind = "read" | "write" | "compute" | "lock" | "unlock" | "wait" | "post" | "branch" | "check" | "atomic" | "nop";
export type Status = { s: "ready" } | { s: "done" } | { s: "blocked"; on: string };

export const show = (i: Instr): string => {
  switch (i.op) {
    case "load": return `${i.r} = ${i.v}`;
    case "store": return `${i.v} = ${i.r}`;
    case "add": return i.k < 0 ? `${i.r} -= ${-i.k}` : `${i.r} += ${i.k}`;
    case "fadd": return `atomic ${i.v} += ${i.k}`;
    case "lock": return `lock(${i.m})`;
    case "unlock": return `unlock(${i.m})`;
    case "wait": return `wait(${i.s})`;
    case "post": return `post(${i.s})`;
    case "brlt": return `if ${i.r} < ${i.k} goto ${i.to}`;
    case "check": return `assert ${i.r} ${i.cmp === "ge" ? ">=" : "<"} ${i.k}`;
    case "nop": return i.note;
  }
};
const kindOf = (i: Instr): Kind => (i.op === "load" ? "read" : i.op === "store" ? "write" : i.op === "add" ? "compute" : i.op === "fadd" ? "atomic" : i.op === "brlt" ? "branch" : i.op);

export function init(names: string[], prog: Instr[][], vars: Record<string, number>, locks: string[] = [], sems: Record<string, number> = {}): Machine {
  return { prog, names, vars: { ...vars }, locks: Object.fromEntries(locks.map((l) => [l, null])), sems: { ...sems }, pcs: prog.map(() => 0), regs: prog.map(() => ({})), inCs: prog.map(() => false), tick: 0, violations: [], log: [] };
}

export function status(m: Machine, tid: number): Status {
  const pc = m.pcs[tid]!, ins = m.prog[tid]![pc];
  if (!ins) return { s: "done" };
  if (ins.op === "lock" && m.locks[ins.m] != null) return { s: "blocked", on: `lock ${ins.m} (held by ${m.names[m.locks[ins.m]!]})` };
  if (ins.op === "wait" && (m.sems[ins.s] ?? 0) <= 0) return { s: "blocked", on: `semaphore ${ins.s} (count 0)` };
  return { s: "ready" };
}
export const runnable = (m: Machine): number[] => m.prog.map((_, i) => i).filter((i) => status(m, i).s === "ready");
export const isTerminal = (m: Machine) => runnable(m).length === 0;
export const allDone = (m: Machine) => m.prog.every((_, i) => status(m, i).s === "done");
export const deadlocked = (m: Machine) => isTerminal(m) && !allDone(m);

/** Who waits for whom, as a sentence. Empty unless every live thread is blocked. */
export function deadlockCycle(m: Machine): string {
  if (!deadlocked(m)) return "";
  return m.prog.map((_, i) => { const s = status(m, i); return s.s === "blocked" ? `${m.names[i]} waits for ${s.on}` : ""; }).filter(Boolean).join("; ");
}

const push = (v: string[], s: string) => { if (!v.includes(s)) v.push(s); };

/** Execute one instruction of thread `tid`. Pure: returns a new machine. A thread that cannot run is a no-op. */
export function step(m: Machine, tid: number): Machine {
  if (status(m, tid).s !== "ready") return m;
  const pc = m.pcs[tid]!, ins = m.prog[tid]![pc]!;
  const n: Machine = { ...m, vars: { ...m.vars }, locks: { ...m.locks }, sems: { ...m.sems }, pcs: [...m.pcs], regs: m.regs.map((r) => ({ ...r })), inCs: [...m.inCs], violations: [...m.violations], log: m.log };
  const reg = n.regs[tid]!, me = m.names[tid]!;
  let next = pc + 1, effect = "";
  switch (ins.op) {
    case "load": reg[ins.r] = n.vars[ins.v] ?? 0; effect = `${ins.r} = ${reg[ins.r]}`; break;
    case "store": effect = `${ins.v}: ${n.vars[ins.v]} -> ${reg[ins.r] ?? 0}`; n.vars[ins.v] = reg[ins.r] ?? 0; break;
    case "add": reg[ins.r] = (reg[ins.r] ?? 0) + ins.k; effect = `${ins.r} = ${reg[ins.r]}`; break;
    case "fadd": effect = `${ins.v}: ${n.vars[ins.v]} -> ${(n.vars[ins.v] ?? 0) + ins.k} (indivisible)`; n.vars[ins.v] = (n.vars[ins.v] ?? 0) + ins.k; break;
    case "lock": n.locks[ins.m] = tid; effect = `${me} now holds ${ins.m}`; break;
    case "unlock":
      if (n.locks[ins.m] !== tid) push(n.violations, `${me} released ${ins.m} without holding it`);
      n.locks[ins.m] = null; effect = `${ins.m} is free`; break;
    case "wait": n.sems[ins.s] = (n.sems[ins.s] ?? 0) - 1; effect = `${ins.s} = ${n.sems[ins.s]}`; break;
    case "post": n.sems[ins.s] = (n.sems[ins.s] ?? 0) + 1; effect = `${ins.s} = ${n.sems[ins.s]}`; break;
    case "brlt": { const take = (reg[ins.r] ?? 0) < ins.k; if (take) next = ins.to; effect = take ? `${ins.r} is small: jump to ${ins.to}` : `${ins.r} is big enough: continue`; break; }
    case "check": {
      const v = reg[ins.r] ?? 0, ok = ins.cmp === "ge" ? v >= ins.k : v < ins.k;
      effect = ok ? "holds" : `FAILS (${ins.r} = ${v})`; if (!ok) push(n.violations, ins.msg); break;
    }
    case "nop": effect = ""; break;
  }
  if (ins.cs === "enter") {
    const other = n.inCs.findIndex((x, i) => x && i !== tid);
    if (other >= 0) push(n.violations, `Mutual exclusion broken: ${m.names[other]} and ${me} are inside the critical section together`);
    n.inCs[tid] = true;
  }
  if (ins.cs === "exit") n.inCs[tid] = false;
  n.pcs[tid] = next;
  n.tick = m.tick + 1;
  n.log = [...m.log, { tick: m.tick, tid, pc, text: show(ins), effect, kind: kindOf(ins) }];
  return n;
}

/** Replay a list of thread ids from a machine (ids that cannot run are skipped, which keeps replay total). */
export function replay(m0: Machine, tids: number[]): Machine[] {
  const out = [m0]; let m = m0;
  for (const t of tids) { const n = step(m, t); if (n !== m) { out.push(n); m = n; } }
  return out;
}

export type Policy = "sequential" | "round-robin" | "random";
/** Run a policy to the end (or `maxSteps`), returning every intermediate machine. Deterministic in (policy, seed, quantum). */
export function autoRun(m0: Machine, policy: Policy, seed = 7, quantum = 1, maxSteps = 400): Machine[] {
  const out = [m0], r = rng(seed); let m = m0, cur = -1, used = 0;
  for (let i = 0; i < maxSteps; i++) {
    const ready = runnable(m); if (!ready.length) break;
    let pick: number;
    if (policy === "random") pick = ready[Math.floor(r() * ready.length)]!;
    else if (policy === "sequential") pick = ready[0]!;
    else {
      if (cur >= 0 && ready.includes(cur) && used < quantum) pick = cur;
      else { const after = ready.filter((t) => t > cur); pick = (after.length ? after : ready)[0]!; used = 0; }
      cur = pick; used++;
    }
    m = step(m, pick); out.push(m);
  }
  return out;
}

export interface Verdict { ok: boolean; label: string }
export type Judge = (m: Machine) => Verdict;
export interface Outcome { label: string; ok: boolean; paths: number; /** one schedule that produces this outcome */ example: number[] }
export interface Exploration { paths: number; states: number; truncated: boolean; outcomes: Outcome[]; badPaths: number }

/**
 * Exhaustively explore every interleaving. Depth-first with memoisation on the full machine state, so two
 * different schedules that reach the same state are explored once (a path count is a DP over the state DAG).
 * Complexity O(states x threads); `maxStates` bounds it for safety.
 */
export function explore(m0: Machine, judge: Judge, maxStates = 80000): Exploration {
  type Res = Map<string, { paths: number; ok: boolean; example: number[] }>;
  const memo = new Map<string, Res>(); let truncated = false;
  const key = (m: Machine) => JSON.stringify([m.vars, m.locks, m.sems, m.pcs, m.regs, m.inCs, m.violations]);
  const rec = (m: Machine): Res => {
    const k = key(m), hit = memo.get(k); if (hit) return hit;
    const ready = runnable(m), res: Res = new Map();
    if (!ready.length) { const v = judge(m); res.set(v.label, { paths: 1, ok: v.ok, example: [] }); }
    else if (memo.size >= maxStates) truncated = true;
    else for (const t of ready) {
      for (const [label, o] of rec(step(m, t))) {
        const cur = res.get(label);
        if (cur) cur.paths += o.paths; else res.set(label, { paths: o.paths, ok: o.ok, example: [t, ...o.example] });
      }
    }
    memo.set(k, res); return res;
  };
  const top = rec(m0), outcomes: Outcome[] = [...top].map(([label, o]) => ({ label, ...o })).sort((a, b) => Number(a.ok) - Number(b.ok) || b.paths - a.paths || a.label.localeCompare(b.label));
  const paths = outcomes.reduce((s, o) => s + o.paths, 0), badPaths = outcomes.filter((o) => !o.ok).reduce((s, o) => s + o.paths, 0);
  return { paths, states: memo.size, truncated, outcomes, badPaths };
}

// ---------------------------------------------------------------- scenarios

export interface Version { id: string; label: string; fixes: string; threads: { name: string; code: Instr[] }[]; vars: Record<string, number>; locks?: string[]; sems?: Record<string, number> }
export interface Scenario {
  id: string; title: string; chapterNote: string; story: string; invariant: string; challenge: string; learn: string;
  options?: { key: string; label: string; values: number[]; default: number };
  versions: (opt: number) => Version[];
  judge: (opt: number) => Judge;
}
const E = "enter" as const, X = "exit" as const;

const counter: Scenario = {
  id: "counter", title: "Lost update", chapterNote: "The classic data race",
  story: "Two threads each add 1 to a shared counter. \"counter += 1\" looks like one step, but the CPU does three: read it, add, write it back.",
  invariant: "After both threads finish, counter equals the total number of increments.",
  challenge: "Find an order of steps that ends with a counter lower than expected. (Hint: let both threads read before either writes.)",
  learn: "A read-modify-write is not atomic. A mutex makes the three steps one critical section; an atomic add makes them one hardware instruction.",
  options: { key: "incr", label: "Increments per thread", values: [1, 2], default: 1 },
  versions: (n) => {
    const reps = (f: (i: number) => Instr[]) => Array.from({ length: n }, (_, i) => f(i)).flat();
    const plain = (): Instr[] => [{ op: "load", r: "t", v: "counter", cs: E }, { op: "add", r: "t", k: 1 }, { op: "store", v: "counter", r: "t", cs: X }];
    const locked = (): Instr[] => [{ op: "lock", m: "L" }, { op: "load", r: "t", v: "counter", cs: E }, { op: "add", r: "t", k: 1 }, { op: "store", v: "counter", r: "t", cs: X }, { op: "unlock", m: "L" }];
    const atomic = (): Instr[] => [{ op: "fadd", v: "counter", k: 1 }];
    const mk = (f: () => Instr[]) => ["T1", "T2"].map((name) => ({ name, code: reps(f) }));
    return [
      { id: "unsafe", label: "Unsafe", fixes: "Nothing: threads read and write freely.", threads: mk(plain), vars: { counter: 0 } },
      { id: "mutex", label: "Mutex", fixes: "Only one thread at a time may run read-add-write.", threads: mk(locked), vars: { counter: 0 }, locks: ["L"] },
      { id: "atomic", label: "Atomic add", fixes: "The whole read-add-write is one indivisible instruction.", threads: mk(atomic), vars: { counter: 0 } },
    ];
  },
  judge: (n) => (m) => { const v = m.vars.counter ?? 0, want = 2 * n; return v === want ? { ok: true, label: `counter = ${v} (correct)` } : { ok: false, label: `lost update: counter = ${v}, expected ${want}` }; },
};

const bank: Scenario = {
  id: "bank", title: "Check-then-act", chapterNote: "Checking is not reserving",
  story: "An account holds 100. Two threads each try to withdraw 80: check the balance, and if there is enough, subtract and save. Only one withdrawal should succeed.",
  invariant: "Balance never goes negative, and balance = 100 - 80 x (number of successful withdrawals).",
  challenge: "Make both withdrawals succeed. (Hint: both threads must pass the check before either saves.)",
  learn: "The check and the action must be one critical section. Even if every individual read and write is safe, the decision made from a stale read is not.",
  versions: () => {
    const body = (lock: boolean): Instr[] => {
      const c: Instr[] = [];
      if (lock) c.push({ op: "lock", m: "L" });
      const base = c.length;
      c.push({ op: "load", r: "b", v: "balance", cs: E }, { op: "brlt", r: "b", k: 80, to: base + 5 }, { op: "add", r: "b", k: -80 }, { op: "store", v: "balance", r: "b" }, { op: "fadd", v: "paid", k: 1 });
      c.push(lock ? { op: "unlock", m: "L", cs: X } : { op: "nop", note: "done", cs: X });
      return c;
    };
    const mk = (lock: boolean) => ["T1", "T2"].map((name) => ({ name, code: body(lock) }));
    return [
      { id: "unsafe", label: "Unsafe", fixes: "Check, then act, with no protection.", threads: mk(false), vars: { balance: 100, paid: 0 } },
      { id: "mutex", label: "Mutex", fixes: "The check and the withdrawal form one critical section.", threads: mk(true), vars: { balance: 100, paid: 0 }, locks: ["L"] },
    ];
  },
  judge: () => (m) => {
    const b = m.vars.balance ?? 0, p = m.vars.paid ?? 0;
    if (b < 0) return { ok: false, label: `overdraft: balance = ${b}` };
    if (b !== 100 - 80 * p) return { ok: false, label: `money created: ${p} withdrawals paid, balance = ${b}` };
    return { ok: true, label: `balance = ${b} (${p} withdrawal paid)` };
  },
};

const deadlock: Scenario = {
  id: "deadlock", title: "Deadlock", chapterNote: "Two locks, opposite order",
  story: "Both threads need lock A and lock B to move money between two accounts. T1 takes A then B. T2 takes B then A.",
  invariant: "Both threads finish. (Nobody waits forever.)",
  challenge: "Make the program hang: step so that each thread holds one lock and wants the other.",
  learn: "Deadlock needs a cycle of waiting. Break the cycle by making every thread take locks in one global order.",
  versions: () => {
    const work: Instr = { op: "fadd", v: "done", k: 1 };
    const t = (first: string, second: string): Instr[] => [{ op: "lock", m: first, cs: E }, { op: "lock", m: second }, work, { op: "unlock", m: second }, { op: "unlock", m: first, cs: X }];
    const v = (id: string, label: string, fixes: string, t2: [string, string]) => ({ id, label, fixes, threads: [{ name: "T1", code: t("A", "B") }, { name: "T2", code: t(...t2) }], vars: { done: 0 }, locks: ["A", "B"] });
    return [
      v("unsafe", "Opposite order", "T1 locks A,B and T2 locks B,A.", ["B", "A"]),
      v("ordered", "Same order", "Everyone locks A before B, always.", ["A", "B"]),
    ];
  },
  judge: () => (m) => deadlocked(m) ? { ok: false, label: "deadlock: nobody can move" } : { ok: true, label: "both finished" },
};

const pc: Scenario = {
  id: "producer-consumer", title: "Producer / consumer", chapterNote: "A bounded buffer",
  story: "A producer puts 2 items into a buffer of size 1 and a consumer takes 2 out. n counts items in the buffer. The producer must wait when it is full, the consumer when it is empty.",
  invariant: "n never exceeds 1 or drops below 0, and ends at 0.",
  challenge: "Make the consumer take from an empty buffer, or the producer overfill it.",
  learn: "Semaphores turn 'wait until there is room / an item' into blocking instead of busy checking. The mutex still protects n itself.",
  versions: () => {
    const prod = (safe: boolean): Instr[] => Array.from({ length: 2 }, () => [
      ...(safe ? [{ op: "wait", s: "empty" } as Instr, { op: "lock", m: "L" } as Instr] : []),
      { op: "load", r: "t", v: "n" } as Instr, { op: "check", r: "t", cmp: "lt", k: 1, msg: "Overflow: producer added to a full buffer" } as Instr, { op: "add", r: "t", k: 1 } as Instr, { op: "store", v: "n", r: "t" } as Instr,
      ...(safe ? [{ op: "unlock", m: "L" } as Instr, { op: "post", s: "full" } as Instr] : []),
    ]).flat();
    const cons = (safe: boolean): Instr[] => Array.from({ length: 2 }, () => [
      ...(safe ? [{ op: "wait", s: "full" } as Instr, { op: "lock", m: "L" } as Instr] : []),
      { op: "load", r: "t", v: "n" } as Instr, { op: "check", r: "t", cmp: "ge", k: 1, msg: "Underflow: consumer took from an empty buffer" } as Instr, { op: "add", r: "t", k: -1 } as Instr, { op: "store", v: "n", r: "t" } as Instr,
      ...(safe ? [{ op: "unlock", m: "L" } as Instr, { op: "post", s: "empty" } as Instr] : []),
    ]).flat();
    return [
      { id: "unsafe", label: "No synchronisation", fixes: "Threads just touch n and hope.", threads: [{ name: "Producer", code: prod(false) }, { name: "Consumer", code: cons(false) }], vars: { n: 0 } },
      { id: "semaphores", label: "Semaphores + mutex", fixes: "empty/full semaphores block at the limits; the mutex guards n.", threads: [{ name: "Producer", code: prod(true) }, { name: "Consumer", code: cons(true) }], vars: { n: 0 }, locks: ["L"], sems: { empty: 1, full: 0 } },
    ];
  },
  judge: () => (m) => {
    if (deadlocked(m)) return { ok: false, label: "stuck: nobody can move" };
    if (m.violations.length) return { ok: false, label: m.violations[0]!.split(":")[0]!.toLowerCase() + ` (n ends at ${m.vars.n})` };
    return (m.vars.n ?? 0) === 0 ? { ok: true, label: "all items passed through, n = 0" } : { ok: false, label: `n ends at ${m.vars.n}, expected 0` };
  },
};

export const SCENARIOS: Scenario[] = [counter, bank, deadlock, pc];
export const scenarioOf = (id: string) => SCENARIOS.find((s) => s.id === id);

export function build(scenarioId: string, versionId: string, opt?: number): { scenario: Scenario; version: Version; machine: Machine; judge: Judge } {
  const sc = scenarioOf(scenarioId) ?? SCENARIOS[0]!, o = sc.options && sc.options.values.includes(opt ?? -1) ? opt! : sc.options?.default ?? 0;
  const vs = sc.versions(o), v = vs.find((x) => x.id === versionId) ?? vs[0]!;
  return { scenario: sc, version: v, machine: init(v.threads.map((t) => t.name), v.threads.map((t) => t.code), v.vars, v.locks, v.sems), judge: sc.judge(o) };
}
