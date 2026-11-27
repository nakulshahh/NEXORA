"use client";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { SCENARIOS, autoRun, build, deadlockCycle, explore, isTerminal, replay, show, status, step, type Exploration, type Kind, type Machine, type Policy } from "@/sim/conc";

const card = "rounded-2xl border border-line bg-surface p-5";
const btn = "inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition disabled:opacity-40";
const primary = `${btn} bg-ink text-bg enabled:hover:bg-signal-ink`;
const ghost = `${btn} border border-line-strong enabled:hover:border-ink`;
const small = "inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-xs font-medium transition enabled:hover:border-ink disabled:opacity-40";
const KIND: Record<Kind, { g: string; cls: string }> = {
  read: { g: "R", cls: "bg-sky-500/25" }, write: { g: "W", cls: "bg-amber-500/30" }, compute: { g: "+", cls: "bg-zinc-500/20" }, atomic: { g: "A", cls: "bg-emerald-500/30" },
  lock: { g: "L", cls: "bg-violet-500/30" }, unlock: { g: "U", cls: "bg-violet-500/15" }, wait: { g: "w", cls: "bg-fuchsia-500/25" }, post: { g: "p", cls: "bg-fuchsia-500/15" },
  branch: { g: "?", cls: "bg-zinc-500/20" }, check: { g: "!", cls: "bg-zinc-500/20" }, nop: { g: "·", cls: "bg-zinc-500/10" },
};
const POLICIES: { value: Policy; label: string; hint: string }[] = [
  { value: "sequential", label: "Sequential (one thread at a time)", hint: "Runs a thread as far as it can before the next. Looks fine. That is the trap." },
  { value: "round-robin", label: "Round robin (time slices)", hint: "Each thread gets a fixed number of steps in turn, like a simple OS scheduler." },
  { value: "random", label: "Random (seeded)", hint: "A random thread each step. Same seed, same run." },
];
const MAX_RUN = 400;

interface Sel { sid: string; vid: string; opt: number }
function readUrl(): { sel: Sel; run: number[] } | null {
  const q = new URLSearchParams(window.location.search), sid = q.get("s"), sc = SCENARIOS.find((x) => x.id === sid);
  if (!sc) return null;
  const o = Number(q.get("o")), opt = sc.options?.values.includes(o) ? o : sc.options?.default ?? 0;
  const vs = sc.versions(opt), vid = vs.find((v) => v.id === q.get("v"))?.id ?? vs[0]!.id;
  const run = (q.get("run") ?? "").split(".").filter(Boolean).slice(0, MAX_RUN).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 4);
  return { sel: { sid: sc.id, vid, opt }, run };
}

export function ConcurrencyArena() {
  const [sel, setSel] = useState<Sel>({ sid: SCENARIOS[0]!.id, vid: "unsafe", opt: SCENARIOS[0]!.options?.default ?? 0 });
  const built = useMemo(() => build(sel.sid, sel.vid, sel.opt), [sel]);
  const [history, setHistory] = useState<Machine[]>(() => [built.machine]);
  const [pos, setPos] = useState(0);
  const [policy, setPolicy] = useState<Policy>("sequential");
  const [seed, setSeed] = useState(7), [quantum, setQuantum] = useState(2);
  const [ex, setEx] = useState<Exploration | null>(null);
  const [cmp, setCmp] = useState<{ label: string; ex: Exploration }[] | null>(null);
  const [ready, setReady] = useState(false);

  const reset = (b = built) => { setHistory([b.machine]); setPos(0); setEx(null); setCmp(null); };
  useEffect(() => {          // shareable state: scenario, version and the exact schedule, read once after hydration
    const u = readUrl();
    if (u) { setSel(u.sel); const b = build(u.sel.sid, u.sel.vid, u.sel.opt), h = replay(b.machine, u.run); setHistory(h); setPos(h.length - 1); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const run = history.slice(1).map((m) => m.log.at(-1)!.tid).join(".");
    const qs = new URLSearchParams({ s: sel.sid, v: sel.vid, ...(built.scenario.options ? { o: String(sel.opt) } : {}), ...(run ? { run } : {}) });
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
  }, [ready, sel, history, built]);

  const pick = (next: Sel) => { setSel(next); const b = build(next.sid, next.vid, next.opt); reset(b); };
  const sc = built.scenario, m = history[pos]!, prev = history[pos - 1];
  const terminal = isTerminal(m), verdict = terminal ? built.judge(m) : null;
  const names = m.names;

  const advance = (tid: number) => { const n = step(m, tid); if (n === m) return; const h = [...history.slice(0, pos + 1), n]; setHistory(h); setPos(h.length - 1); setEx(null); };
  const runToEnd = () => { const run = autoRun(m, policy, seed, quantum, MAX_RUN); const h = [...history.slice(0, pos + 1), ...run.slice(1)]; setHistory(h); setPos(h.length - 1); };
  const autoOne = () => { const run = autoRun(m, policy, seed + pos, quantum, 1); if (run.length > 1) { const h = [...history.slice(0, pos + 1), run[1]!]; setHistory(h); setPos(h.length - 1); } };
  const doExplore = () => setEx(explore(built.machine, built.judge));
  const doCompare = () => setCmp(sc.versions(sel.opt).map((v) => { const b = build(sc.id, v.id, sel.opt); return { label: v.label, ex: explore(b.machine, b.judge) }; }));
  const showSchedule = (tids: number[]) => { const h = replay(built.machine, tids); setHistory(h); setPos(h.length - 1); };

  // Timeline: one cell per executed step, shaded while its thread is inside the critical section.
  const cells = useMemo(() => {
    const inside = names.map(() => false), out: { tid: number; kind: Kind; text: string; effect: string; cs: boolean; clash: boolean }[] = [];
    for (const ev of m.log) {
      const ins = m.prog[ev.tid]![ev.pc]!, wasIn = inside[ev.tid]!;
      if (ins.cs === "enter") inside[ev.tid] = true;
      const clash = inside.filter(Boolean).length >= 2;
      out.push({ tid: ev.tid, kind: ev.kind, text: ev.text, effect: ev.effect, cs: wasIn || ins.cs === "enter", clash });
      if (ins.cs === "exit") inside[ev.tid] = false;
    }
    return out;
  }, [m, names]);

  const version = built.version;
  return (
    <div className="space-y-5">
      <nav aria-label="Scenarios" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === sel.sid} onClick={() => pick({ sid: s.id, vid: "unsafe", opt: s.options?.default ?? 0 })}
            className={clsx("min-w-[10rem] shrink-0 rounded-xl border px-4 py-2 text-left transition md:min-w-0", s.id === sel.sid ? "border-signal bg-signal/10" : "border-line hover:border-ink")}>
            <span className="block text-sm font-medium">{s.title}</span><span className="block text-xs text-ink-2">{s.chapterNote}</span>
          </button>
        ))}
      </nav>

      <section className={card} aria-label="The scenario">
        <p className="text-ink">{sc.story}</p>
        <p className="mt-2 text-sm"><span className="font-medium">Invariant:</span> {sc.invariant}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div role="group" aria-label="Version" className="flex flex-wrap gap-2">
            {sc.versions(sel.opt).map((v) => (
              <button key={v.id} type="button" aria-pressed={v.id === sel.vid} onClick={() => pick({ ...sel, vid: v.id })}
                className={clsx("h-9 rounded-full border px-4 text-sm transition", v.id === sel.vid ? "border-ink bg-ink text-bg" : "border-line-strong hover:border-ink")}>{v.label}</button>
            ))}
          </div>
          {sc.options && (
            <label className="text-sm">{sc.options.label}{" "}
              <select value={sel.opt} onChange={(e) => pick({ ...sel, opt: Number(e.target.value) })} className="h-9 rounded-lg border border-line-strong bg-surface px-2">
                {sc.options.values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select></label>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-2"><span className="font-medium text-ink">{version.label}:</span> {version.fixes}</p>
        <p className="mt-2 text-sm text-ink-2"><span className="font-medium text-ink">Challenge:</span> {sc.challenge}</p>
      </section>

      <section aria-label="Threads and memory" className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {names.map((name, tid) => {
            const code = m.prog[tid]!, st = status(m, tid), pc = m.pcs[tid]!;
            const inSection: boolean[] = []; { let on = false; for (const i of code) { if (i.cs === "enter") on = true; inSection.push(on); if (i.cs === "exit") on = false; } }
            const first = inSection.indexOf(true);
            const regs = Object.entries(m.regs[tid]!);
            return (
              <div key={name} className={card} data-testid={`thread-${tid}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{name}</h3>
                  <span className={clsx("rounded-full px-2.5 py-0.5 font-mono text-[11px]", st.s === "ready" && "bg-emerald-500/20", st.s === "done" && "bg-zinc-500/20", st.s === "blocked" && "bg-rose-500/25")}>
                    {st.s === "blocked" ? "blocked" : st.s}</span>
                </div>
                <ol className="mt-3 font-mono text-[13px]" aria-label={`${name} program`}>
                  {code.map((ins, i) => {
                    const inCsRange = inSection[i]!;
                    return (
                      <li key={i} aria-current={i === pc ? "step" : undefined}
                        className={clsx("flex items-center gap-2 border-l-2 px-2 py-0.5", inCsRange ? "border-signal bg-signal/5" : "border-transparent", i === pc && "bg-ink/10 font-semibold", i < pc && "text-ink-3")}>
                        <span aria-hidden className="w-3 text-signal">{i === pc ? "▶" : ""}</span><span className="w-5 text-ink-3">{i}</span><span className="min-w-0 break-words">{show(ins)}</span>
                      </li>
                    );
                  })}
                </ol>
                {first >= 0 && <p className="mt-1 text-[11px] text-ink-3"><span className="border-l-2 border-signal pl-1">intended critical section</span></p>}
                <p className="mt-2 font-mono text-xs text-ink-2">{regs.length ? `registers: ${regs.map(([k, v]) => `${k}=${v}`).join(" ")}` : "registers: (none yet)"}</p>
                {st.s === "blocked" && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">Waiting for {st.on}.</p>}
                <button type="button" className={clsx(small, "mt-3")} disabled={st.s !== "ready"} onClick={() => advance(tid)} aria-label={`Run next step of ${name}`}>
                  Run next step{st.s === "ready" ? `: ${show(code[pc]!)}` : ""}
                </button>
              </div>
            );
          })}
        </div>
        <aside className={clsx(card, "h-fit")} aria-label="Shared memory">
          <h3 className="font-medium">Shared memory</h3>
          <dl className="mt-3 space-y-1.5 font-mono text-sm" data-testid="memory">
            {Object.entries(m.vars).map(([k, v]) => <div key={k} className={clsx("flex justify-between rounded px-2 py-0.5", prev && prev.vars[k] !== v && "bg-amber-500/30")}><dt>{k}</dt><dd>{v}</dd></div>)}
            {Object.entries(m.locks).map(([k, v]) => <div key={k} className={clsx("flex justify-between rounded px-2 py-0.5", prev && prev.locks[k] !== v && "bg-violet-500/25")}><dt>lock {k}</dt><dd>{v == null ? "free" : names[v]}</dd></div>)}
            {Object.entries(m.sems).map(([k, v]) => <div key={k} className={clsx("flex justify-between rounded px-2 py-0.5", prev && prev.sems[k] !== v && "bg-fuchsia-500/25")}><dt>sem {k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-ink-3">Highlighted: changed by the last step.</p>
        </aside>
      </section>

      <section className={card} aria-label="Timeline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Timeline</h3>
          <p className="text-xs text-ink-3">Step {pos} of {history.length - 1} · each column is one step · shaded = inside the critical section · red = two threads inside at once</p>
        </div>
        <div className="mt-3 max-w-full overflow-x-auto pb-2">
          <div className="min-w-max space-y-1.5" role="img" aria-label={`Timeline of ${cells.length} steps across ${names.length} threads`}>
            {names.map((name, tid) => (
              <div key={name} className="flex items-center gap-1">
                <span className="w-20 shrink-0 truncate text-xs text-ink-2">{name}</span>
                {cells.length === 0 && <span className="text-xs text-ink-3">no steps yet</span>}
                {cells.map((c, i) => c.tid === tid
                  ? <span key={i} title={`${i + 1}. ${name}: ${c.text}${c.effect ? ` (${c.effect})` : ""}`} className={clsx("flex h-7 w-7 items-center justify-center rounded font-mono text-xs", KIND[c.kind].cls, c.cs && "ring-1 ring-signal/70", c.clash && "ring-2 ring-rose-600")}>{KIND[c.kind].g}</span>
                  : <span key={i} className="h-7 w-7 rounded border border-dashed border-line/60" aria-hidden />)}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-3">R read · W write · + compute · A atomic · L lock · U unlock · w wait · p post · ? branch · ! assert</p>
        <label className="mt-3 block text-sm">Scrub history
          <input type="range" min={0} max={history.length - 1} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Scrub history" className="w-full accent-[var(--signal)]" /></label>
        <div role="log" aria-label="Step log" className="mt-3 max-h-40 overflow-y-auto"><ol className="space-y-0.5 font-mono text-xs text-ink-2">
          {m.log.length === 0 && <li>Nothing has run yet. Pick a thread above, or choose an automatic schedule below.</li>}
          {m.log.map((ev, i) => <li key={i}><span className="text-ink-3">{i + 1}.</span> <span className="text-ink">{names[ev.tid]}</span>: {ev.text}{ev.effect ? <span className="text-ink-3"> → {ev.effect}</span> : null}</li>)}
        </ol></div>
      </section>

      <section className={card} aria-label="Result" aria-live="polite">
        {!terminal && <p className="text-sm text-ink-2" data-testid="verdict">Still running. {m.violations.length === 0 ? "No problems so far." : ""}</p>}
        {verdict && <p data-testid="verdict" className={clsx("text-lg font-medium", verdict.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{verdict.ok ? "Correct: " : "Wrong: "}{verdict.label}</p>}
        {verdict && deadlockCycle(m) && <p className="mt-1 text-sm text-ink-2">{deadlockCycle(m)}. Each holds what the other needs, so neither can ever continue.</p>}
        {m.violations.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-rose-700 dark:text-rose-300" aria-label="Violations">{m.violations.map((v) => <li key={v}>{v}</li>)}</ul>}
        {verdict && !verdict.ok && sel.vid === "unsafe" && <p className="mt-2 text-sm font-medium" data-testid="challenge-done">Challenge complete: you found an interleaving that breaks it. Now run the same schedule on a safe version.</p>}
        {verdict && verdict.ok && sel.vid === "unsafe" && <p className="mt-2 text-sm text-ink-2" data-testid="lucky">This run was correct, but only because of the order. The bug is still there: try another schedule, or explore all of them.</p>}
        <p className="mt-2 text-sm text-ink-2">{sc.learn}</p>
      </section>

      <section className={card} aria-label="Schedule controls">
        <h3 className="font-medium">Choose the interleaving</h3>
        <p className="mt-1 text-sm text-ink-2">Click a thread's button to run exactly one step of it, or let a scheduler decide.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Scheduler<br />
            <select value={policy} onChange={(e) => setPolicy(e.target.value as Policy)} className="mt-1 h-10 rounded-lg border border-line-strong bg-surface px-2">{POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          {policy === "round-robin" && <label className="text-sm">Steps per turn<br /><select value={quantum} onChange={(e) => setQuantum(Number(e.target.value))} className="mt-1 h-10 rounded-lg border border-line-strong bg-surface px-2">{[1, 2, 3, 4].map((q) => <option key={q}>{q}</option>)}</select></label>}
          {policy === "random" && <label className="text-sm">Seed<br /><input type="number" min={0} max={999999} value={seed} onChange={(e) => setSeed(Math.max(0, Math.min(999999, Math.floor(Number(e.target.value) || 0))))} className="mt-1 h-10 w-24 rounded-lg border border-line-strong bg-surface px-2" /></label>}
          <button type="button" className={primary} onClick={runToEnd} disabled={terminal}>Run to the end</button>
          <button type="button" className={ghost} onClick={autoOne} disabled={terminal}>One automatic step</button>
          <button type="button" className={ghost} onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>Back</button>
          <button type="button" className={ghost} onClick={() => setPos((p) => Math.min(history.length - 1, p + 1))} disabled={pos >= history.length - 1}>Forward</button>
          <button type="button" className={ghost} onClick={() => reset()}>Reset</button>
        </div>
        <p className="mt-2 text-xs text-ink-3">{POLICIES.find((p) => p.value === policy)!.hint}</p>
      </section>

      <section className={card} aria-label="Explore every interleaving">
        <h3 className="font-medium">Don't guess: check every interleaving</h3>
        <p className="mt-1 text-sm text-ink-2">The machine is deterministic, so every possible order can be enumerated. Identical states are merged, so this stays fast.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={primary} onClick={doExplore}>Explore this version</button>
          <button type="button" className={ghost} onClick={doCompare}>Compare all versions</button>
        </div>
        {ex && (
          <div className="mt-4" data-testid="explore">
            <p className="text-sm" role="status">{ex.paths.toLocaleString()} possible schedules · {ex.badPaths.toLocaleString()} wrong ({ex.paths ? ((ex.badPaths / ex.paths) * 100).toFixed(ex.badPaths && ex.badPaths < ex.paths * 0.01 ? 2 : 1) : "0"}%){ex.truncated ? " · search truncated" : ""}</p>
            <ul className="mt-2 space-y-2">
              {ex.outcomes.map((o) => (
                <li key={o.label} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={clsx("text-sm font-medium", o.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{o.label}</span>
                    <button type="button" className={small} onClick={() => showSchedule(o.example)}>Show one schedule that does this</button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
                    <span className="h-2 flex-1 overflow-hidden rounded bg-ink/10"><span className={clsx("block h-full", o.ok ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${Math.max(1, (o.paths / ex.paths) * 100)}%` }} /></span>
                    <span className="w-28 text-right font-mono">{o.paths.toLocaleString()} schedules</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cmp && (
          <div className="mt-4 overflow-x-auto" data-testid="compare">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-ink-3"><tr><th className="py-1 pr-3 font-medium">Version</th><th className="pr-3 font-medium">Schedules</th><th className="pr-3 font-medium">Wrong</th><th className="font-medium">Verdict</th></tr></thead>
              <tbody>{cmp.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-medium">{r.label}</td><td className="pr-3 font-mono">{r.ex.paths.toLocaleString()}</td>
                  <td className="pr-3 font-mono">{r.ex.badPaths.toLocaleString()} ({((r.ex.badPaths / Math.max(1, r.ex.paths)) * 100).toFixed(1)}%)</td>
                  <td className={r.ex.badPaths ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}>{r.ex.badPaths ? "can fail" : "correct on every schedule"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2" aria-label="What this simplifies">
        <p className="font-medium text-ink">What this model simplifies</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Sequential consistency: every step is visible to all threads at once. Real CPUs reorder and buffer memory operations, so real bugs can be stranger.</li>
          <li>One instruction per step. Real code compiles to many more, and the scheduler can pause a thread between any two.</li>
          <li>Threads are straight-line programs with one jump. No allocation, I/O, priorities, timers or fairness guarantees.</li>
          <li>Locks are not re-entrant and have no timeout. Semaphores wake in no particular order.</li>
        </ul>
      </section>
    </div>
  );
}
