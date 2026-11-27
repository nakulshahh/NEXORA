import type { ParamDef, Params, SimSpec, Step } from "./engine.ts";

/**
 * A model of Node's event loop over a restricted set of programs.
 * Programs are small trees of operations; each snippet also carries the JavaScript source it
 * stands for, and tests/eventloop.test.ts runs that source in REAL Node and compares output.
 */
export type Op =
  | { op: "log"; text: string; line: number }
  | { op: "tick"; body: Op[]; line: number }
  | { op: "micro"; via: "then" | "await" | "queueMicrotask"; body: Op[]; line: number }
  | { op: "timeout"; delay: number; body: Op[]; line: number }
  | { op: "immediate"; body: Op[]; line: number }
  | { op: "io"; body: Op[]; line: number };

export interface Item { id: string; label: string }
export interface ELState {
  phase: "main" | "ticks" | "microtasks" | "timers" | "poll" | "check" | "done";
  clock: number;
  stack: string[];
  ticks: Item[];
  micro: Item[];
  timers: (Item & { due: number })[];
  immediates: Item[];
  io: (Item & { ready: number })[];
  out: string[];
  line: number | null;
}

export interface Snippet { id: string; title: string; lesson: string; deterministicInNode: boolean; build: (p: Params) => { source: string; program: Op[] } }
const L = (op: Op["op"], line: number, body: Op[] = [], extra: object = {}) => ({ op, line, body, ...extra }) as Op;
const log = (text: string, line: number): Op => ({ op: "log", text, line });

export const SNIPPETS: Snippet[] = [
  {
    id: "queues", title: "nextTick, promises, timers", deterministicInNode: true,
    lesson: "After the script, Node drains process.nextTick first, then promise jobs, and only then lets the loop reach timers.",
    build: () => ({
      source: [
        "console.log('sync 1');",
        "setTimeout(() => console.log('timeout'), 0);",
        "Promise.resolve().then(() => console.log('promise'));",
        "process.nextTick(() => console.log('nextTick'));",
        "console.log('sync 2');",
      ].join("\n"),
      program: [log("sync 1", 1), L("timeout", 2, [log("timeout", 2)], { delay: 0 }), L("micro", 3, [log("promise", 3)], { via: "then" }), L("tick", 4, [log("nextTick", 4)]), log("sync 2", 5)],
    }),
  },
  {
    id: "nested", title: "Queues scheduling queues", deterministicInNode: true,
    lesson: "Ticks drain fully, then microtasks drain fully, and the pair repeats until both are empty. Work scheduled from inside either queue joins the right queue, not the back of everything.",
    build: () => ({
      source: [
        "process.nextTick(() => {",
        "  console.log('tick 1');",
        "  Promise.resolve().then(() => console.log('promise from tick'));",
        "  process.nextTick(() => console.log('tick from tick'));",
        "});",
        "Promise.resolve().then(() => {",
        "  console.log('promise 1');",
        "  process.nextTick(() => console.log('tick from promise'));",
        "  Promise.resolve().then(() => console.log('promise from promise'));",
        "});",
        "console.log('sync');",
      ].join("\n"),
      program: [
        L("tick", 1, [log("tick 1", 2), L("micro", 3, [log("promise from tick", 3)], { via: "then" }), L("tick", 4, [log("tick from tick", 4)])]),
        L("micro", 6, [log("promise 1", 7), L("tick", 8, [log("tick from promise", 8)]), L("micro", 9, [log("promise from promise", 9)], { via: "then" })], { via: "then" }),
        log("sync", 11),
      ],
    }),
  },
  {
    id: "async", title: "async / await", deterministicInNode: true,
    lesson: "An async function runs synchronously until its first await. Everything after the await becomes a microtask; the caller keeps going.",
    build: () => ({
      source: [
        "async function f() {",
        "  console.log('f start');",
        "  await null;",
        "  console.log('f after await');",
        "}",
        "console.log('before');",
        "f();",
        "Promise.resolve().then(() => console.log('promise'));",
        "process.nextTick(() => console.log('tick'));",
        "console.log('after');",
      ].join("\n"),
      program: [log("before", 6), log("f start", 2), L("micro", 3, [log("f after await", 4)], { via: "await" }), L("micro", 8, [log("promise", 8)], { via: "then" }), L("tick", 9, [log("tick", 9)]), log("after", 10)],
    }),
  },
  {
    id: "timers", title: "Timer ordering", deterministicInNode: true,
    lesson: "Timers fire in order of when they are due, not the order you wrote them, and never before the current script and its microtasks have finished.",
    build: (p) => {
      const d = Number(p.delay);
      return {
        source: [
          `setTimeout(() => console.log('timer ${d}ms'), ${d});`,
          "setTimeout(() => console.log('timer 0ms'), 0);",
          "setTimeout(() => console.log('timer 5ms'), 5);",
          "Promise.resolve().then(() => console.log('microtask'));",
          "console.log('sync');",
        ].join("\n"),
        program: [L("timeout", 1, [log(`timer ${d}ms`, 1)], { delay: d }), L("timeout", 2, [log("timer 0ms", 2)], { delay: 0 }), L("timeout", 3, [log("timer 5ms", 3)], { delay: 5 }), L("micro", 4, [log("microtask", 4)], { via: "then" }), log("sync", 5)],
      };
    },
  },
  {
    id: "io", title: "Inside an I/O callback", deterministicInNode: true,
    lesson: "Inside an I/O callback the loop is in the poll phase, so the check phase (setImmediate) comes before the next timers phase: immediate always beats timeout here.",
    build: () => ({
      source: [
        "const fs = require('fs');",
        "fs.readFile(__filename, () => {",
        "  console.log('io callback');",
        "  setTimeout(() => console.log('timeout'), 0);",
        "  setImmediate(() => console.log('immediate'));",
        "  process.nextTick(() => console.log('tick'));",
        "});",
        "console.log('sync');",
      ].join("\n"),
      program: [L("io", 2, [log("io callback", 3), L("timeout", 4, [log("timeout", 4)], { delay: 0 }), L("immediate", 5, [log("immediate", 5)]), L("tick", 6, [log("tick", 6)])]), log("sync", 8)],
    }),
  },
  {
    id: "race", title: "setTimeout 0 vs setImmediate", deterministicInNode: false,
    lesson: "From the main script this order depends on how long startup took: if 1 ms has passed when the loop starts, the timer is already due. Real Node varies run to run, so the model exposes it as a parameter.",
    build: () => ({
      source: [
        "setTimeout(() => console.log('timeout'), 0);",
        "setImmediate(() => console.log('immediate'));",
        "console.log('sync');",
      ].join("\n"),
      program: [L("timeout", 1, [log("timeout", 1)], { delay: 0 }), L("immediate", 2, [log("immediate", 2)]), log("sync", 3)],
    }),
  },
];

const params: ParamDef[] = [
  { key: "snippet", label: "Program", kind: "select", options: SNIPPETS.map((s) => ({ value: s.id, label: s.title })) },
  { key: "syncMs", label: "Startup work (sync time)", kind: "range", min: 0, max: 5, step: 1, unit: "ms", hint: "How long the main script runs before the loop starts. Decides whether a 0 ms timer is already due." },
  { key: "ioMs", label: "I/O completes after", kind: "range", min: 1, max: 20, step: 1, unit: "ms", hint: "Virtual time until a file read finishes." },
  { key: "delay", label: "First timer delay (Timer ordering)", kind: "range", min: 0, max: 30, step: 5, unit: "ms", hint: "Only used by the Timer ordering program." },
];
const defaults: Params = { snippet: "queues", syncMs: 2, ioMs: 5, delay: 20 };

export const sourceOf = (p: Params) => (SNIPPETS.find((s) => s.id === p.snippet) ?? SNIPPETS[0]!).build(p).source;

export function eventLoopScenario(p: Params): Step<ELState>[] {
  const sn = SNIPPETS.find((s) => s.id === p.snippet) ?? SNIPPETS[0]!;
  return programScenario(sn.build(p).program, Number(p.syncMs), Number(p.ioMs));
}

/** The same model for any program (the playground compiles learner code into `Op[]`). */
export function programScenario(program: Op[], syncMs: number, ioMs: number): Step<ELState>[] {
  const steps: Step<ELState>[] = [];
  const S: ELState = { phase: "main", clock: 0, stack: [], ticks: [], micro: [], timers: [], immediates: [], io: [], out: [], line: null };
  let seq = 0;
  const snap = (label: string, explain: string, line: number | null, ms = 0) => {
    S.line = line;
    steps.push({ id: `s${steps.length}`, label, explain, ms, state: { ...S, stack: [...S.stack], ticks: [...S.ticks], micro: [...S.micro], timers: S.timers.map((x) => ({ ...x })), immediates: [...S.immediates], io: S.io.map((x) => ({ ...x })), out: [...S.out] } });
  };

  // Callback bodies live beside their queue entries.
  const bodies = new Map<string, Op[]>();
  const mk = (kind: string, body: Op[]): Item => { const id = `${kind}#${++seq}`; bodies.set(id, body); return { id, label: id }; };

  const exec = (ops: Op[]) => {
    for (const o of ops) {
      switch (o.op) {
        case "log": S.out.push(o.text); snap(`console.log("${o.text}")`, "Synchronous code runs immediately and prints right away.", o.line); break;
        case "tick": { const it = mk("nextTick", o.body); S.ticks.push(it); snap("process.nextTick(cb)", "Queued in the nextTick queue. It runs as soon as the current operation finishes, before promise jobs.", o.line); break; }
        case "micro": {
          const it = mk(o.via === "await" ? "await-continuation" : o.via === "then" ? ".then" : "microtask", o.body); S.micro.push(it);
          snap(o.via === "await" ? "await: the rest of the function is queued" : o.via === "then" ? "promise.then(cb) on a settled promise" : "queueMicrotask(cb)", o.via === "await" ? "await pauses only this function. Its remainder becomes a microtask and the caller carries on." : "The promise is already settled, so its reaction goes straight into the microtask queue.", o.line); break;
        }
        case "timeout": { const d = Math.max(1, o.delay); const it = mk("timeout", o.body); S.timers.push({ ...it, due: S.clock + d }); snap(`setTimeout(cb, ${o.delay})`, `The timer is handed to the runtime and will be due at t=${S.clock + d}ms. A delay of 0 is treated as 1 ms.`, o.line); break; }
        case "immediate": { const it = mk("immediate", o.body); S.immediates.push(it); snap("setImmediate(cb)", "Queued for the check phase, which runs right after the poll phase.", o.line); break; }
        case "io": { const it = mk("io", o.body); S.io.push({ ...it, ready: S.clock + ioMs }); snap("fs.readFile(…, cb)", `The read is handed to the thread pool. Its callback becomes ready at t=${S.clock + ioMs}ms and is delivered in the poll phase.`, o.line); break; }
      }
    }
  };
  const run = (id: string, why: string) => {
    const body = bodies.get(id) ?? [];
    S.stack = [id];
    snap(`Run ${id}`, why, body[0] && "line" in body[0] ? body[0].line : null);
    exec(body);
    S.stack = [];
  };
  /** Node's processTicksAndRejections: drain all ticks, then all microtasks, repeat until both are empty. */
  const drain = () => {
    while (S.ticks.length || S.micro.length) {
      while (S.ticks.length) { const t = S.ticks.shift()!; S.phase = "ticks"; run(t.id, "The nextTick queue is drained before promise jobs, one callback at a time."); }
      while (S.micro.length) { const m = S.micro.shift()!; S.phase = "microtasks"; run(m.id, "The microtask queue is drained completely, including jobs added while draining."); }
    }
  };

  S.stack = ["main script"];
  snap("Run the main script", "The whole script is one task. Nothing queued will run until it finishes.", 1);
  exec(program);
  S.stack = [];
  if (syncMs > 0) { S.clock += syncMs; snap(`Main script ends at t=${S.clock}ms`, `The script took ${syncMs}ms of synchronous work. Virtual time passed while nothing else could run.`, null, syncMs); }
  drain();

  let guard = 0;
  while ((S.timers.length || S.immediates.length || S.io.length) && guard++ < 50) {
    // timers
    const due = S.timers.filter((t) => t.due <= S.clock).sort((a, b) => a.due - b.due || a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (due.length) {
      S.phase = "timers"; snap("Event loop: timers phase", "The loop runs every timer whose time has come, oldest first, draining ticks and microtasks after each callback.", null);
      for (const t of due) { S.timers = S.timers.filter((x) => x.id !== t.id); run(t.id, `Timer due at t=${t.due}ms, now t=${S.clock}ms.`); drain(); }
    }
    // poll
    const ready = () => S.io.filter((x) => x.ready <= S.clock).sort((a, b) => a.ready - b.ready);
    if (!ready().length && !S.immediates.length && (S.timers.length || S.io.length)) {
      const next = Math.min(...S.timers.map((t) => t.due), ...S.io.map((x) => x.ready));
      S.phase = "poll"; const from = S.clock; S.clock = next;
      snap(`Poll phase: wait until t=${next}ms`, `Nothing is ready and no setImmediate is pending, so the loop sleeps in poll until the next timer or I/O event (${next - from}ms).`, null, next - from);
    }
    const r = ready();
    if (r.length) {
      S.phase = "poll"; snap("Event loop: poll phase", "Completed I/O callbacks are delivered here.", null);
      for (const x of r) { S.io = S.io.filter((y) => y.id !== x.id); run(x.id, "I/O finished; its callback runs in the poll phase."); drain(); }
    }
    // check
    if (S.immediates.length) {
      S.phase = "check"; snap("Event loop: check phase", "setImmediate callbacks run here, right after poll. Immediates added while this phase runs wait for the next loop iteration.", null);
      const batch = [...S.immediates]; S.immediates = [];
      for (const im of batch) { run(im.id, "A setImmediate callback in the check phase."); drain(); }
    }
  }
  S.phase = "done";
  snap("Nothing left to do", "All queues are empty, so the process exits. Final output is shown in the console panel.", null);
  return steps;
}

export const EVENT_LOOP_SPEC: SimSpec<ELState> = {
  id: "event-loop", title: "Node.js event loop", params, defaults, scenario: (p) => eventLoopScenario(p),
  simplifies: [
    "Programs come from a curated set; there is no free-form editor yet. Each program's JavaScript is run in real Node by the test suite and its output is compared with this model.",
    "Time is virtual: callbacks cost 0 ms and you choose how long startup work and I/O take. Real timing is noisy, which is why setTimeout 0 versus setImmediate in the main script is a parameter, not a prediction.",
    "Models CommonJS semantics (an ES module's top level behaves differently because it already runs inside a microtask).",
    "I/O is one completion per file read, delivered in the poll phase. The pending-callbacks and close phases are skipped, and there is no real thread pool, network or worker.",
    "Only promises that are already settled are modelled; chained .then() returning new promises is not.",
  ],
};
