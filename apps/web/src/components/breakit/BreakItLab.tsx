"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { INCIDENTS, cloneSetup, evaluate, incidentById, runSetup, webGraph, type Incident, type Setup } from "@/lib/arch/incidents";
import { LOAD_DEFAULTS, type Fault, type FaultKind, type LoadResult } from "@/lib/arch/load";
import { Charts, Compare, Levers, LogPanel, NodeTable, Topology } from "./parts";

const card = "rounded-2xl border border-line bg-surface p-5";
const btn = "inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition disabled:opacity-40";
const primary = `${btn} bg-ink text-bg enabled:hover:bg-signal-ink`;
const ghost = `${btn} border border-line-strong enabled:hover:border-ink`;
const FAULT_KINDS: { value: FaultKind; label: string; hint: string }[] = [
  { value: "down", label: "Down (fails at once)", hint: "" }, { value: "slow", label: "Slow (latency multiplied)", hint: "Multiplier, e.g. 8" },
  { value: "errors", label: "Errors (share of requests fail)", hint: "Error rate 0 to 1" }, { value: "blackhole", label: "Hangs (accepts, never answers)", hint: "" },
  { value: "pause", label: "Paused (stops working, keeps queue)", hint: "" }, { value: "cache-cold", label: "Cache wiped (then refills)", hint: "Seconds to refill" },
];
const dots = (n: number) => "●".repeat(n) + "○".repeat(3 - n);

function Report({ r, setup, label }: { r: LoadResult; setup: Setup; label: string }) {
  const faults = setup.load.faults ?? [];
  const first = faults[0]?.at ?? 0;
  const [t, setT] = useState(Math.min(r.timeline.length - 1, first + 3));
  const s = r.timeline[Math.min(t, r.timeline.length - 1)]!;
  return (
    <section aria-label={label} className={card} data-testid="report">
      <p className="font-medium">{label}</p>
      <p role="status" className="mt-1 text-sm text-ink-2">{(r.successRate * 100).toFixed(1)}% succeeded · p95 {r.p95 >= 100 ? r.p95.toFixed(0) : r.p95.toFixed(1)} ms · {r.amplification.toFixed(2)}x load offered · longest queue {Math.max(0, ...Object.values(r.nodes).map((n) => n.maxQueue))}</p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <div>
          <Topology g={setup.graph} r={r} faults={faults} t={t} />
          <label className="mt-2 block text-sm">Time: second {t} <span className="text-ink-3">({s.ok} of {s.offered} requests completed in time that second)</span>
            <input type="range" min={0} max={r.timeline.length - 1} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-full accent-[var(--signal)]" aria-label="Scrub through time" /></label>
          <div className="mt-3"><NodeTable r={r} g={setup.graph} /></div>
        </div>
        <div><Charts r={r} faults={faults} t={t} onSeek={setT} /><div className="mt-4"><LogPanel r={r} g={setup.graph} t={t} /></div></div>
      </div>
    </section>
  );
}

function Guided() {
  const [id, setId] = useState<string>(INCIDENTS[0]!.id);
  const inc = incidentById(id)!;
  const [setup, setSetup] = useState<Setup>(() => inc.setup());
  const [base, setBase] = useState<LoadResult | null>(null);
  const [after, setAfter] = useState<LoadResult | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState(0);
  const [showFixes, setShowFixes] = useState(false);
  const solved = pick === inc.answer, unlocked = solved || wrong >= 2;
  const original = useMemo(() => inc.setup(), [inc]);

  const choose = (i: Incident) => { setId(i.id); setSetup(i.setup()); setBase(null); setAfter(null); setPick(null); setWrong(0); setHint(0); setShowFixes(false); };
  const reproduce = () => { const r = runSetup(original); setBase(r); setAfter(null); setSetup(cloneSetup(original)); };
  const answer = (i: number) => { if (solved) return; setPick(i); if (i !== inc.answer) setWrong((w) => w + 1); };
  const rerun = () => setAfter(runSetup(setup));
  const faults = original.load.faults ?? [];
  const changed = JSON.stringify(setup) !== JSON.stringify(original);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Incidents"><ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {INCIDENTS.map((i) => (
          <li key={i.id} className="min-w-[11rem] lg:min-w-0"><button type="button" onClick={() => choose(i)} aria-current={i.id === id ? "true" : undefined} className={clsx("w-full rounded-xl border px-3 py-2.5 text-left text-sm transition", i.id === id ? "border-signal bg-signal-wash" : "border-line hover:border-ink")}>
            <span className="block font-medium">{i.title}</span><span className="block text-xs text-ink-2"><span aria-label={`Difficulty ${i.difficulty} of 3`}>{dots(i.difficulty)}</span> · {i.chapter}</span></button></li>))}
      </ul></nav>

      <div className="min-w-0 space-y-5">
        <section className={card} aria-label="The page">
          <p className="eyebrow">1 · You are on call</p>
          <p className="mt-2 text-ink-2">{inc.page}</p>
          <p className="mt-3 text-sm"><span className="font-medium">Goal:</span> {inc.sloText}</p>
          <div className="mt-4"><button type="button" onClick={reproduce} className={primary}>{base ? "Reproduce again" : "Reproduce the incident"}</button></div>
        </section>

        {base && <Report r={base} setup={original} label="2 · Observe: what the system did" />}

        {base && (
          <section className={card} aria-label="Diagnose">
            <p className="eyebrow">3 · Find the root cause</p>
            <p className="mt-2 font-medium">{inc.question}</p>
            <ul className="mt-3 space-y-2">{inc.choices.map((c, i) => {
              const chosen = pick === i, right = i === inc.answer;
              return <li key={i}><button type="button" onClick={() => answer(i)} disabled={solved} aria-pressed={chosen} className={clsx("w-full rounded-xl border px-4 py-2.5 text-left text-sm transition", chosen && right ? "border-ok bg-ok/10" : chosen ? "border-warn bg-warn/10" : "border-line hover:border-ink")}>
                {c}{chosen && <span className="ml-2 text-xs">{right ? "✓ correct" : "✗ not quite"}</span>}</button></li>; })}</ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setHint((h) => Math.min(3, h + 1))} disabled={hint >= 3 || solved} className={ghost}>{hint === 0 ? "Give me a hint" : `Another hint (${hint}/3)`}</button>
              {!unlocked && wrong === 0 && <span className="text-xs text-ink-3">Answer to unlock the fix step.</span>}
            </div>
            {hint > 0 && <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2" aria-label="Hints">{inc.hints.slice(0, hint).map((h, i) => <li key={i}>{h}</li>)}</ol>}
            {(solved || wrong >= 2) && <div role="status" className="mt-4 rounded-xl border border-line bg-bg-2 p-4 text-sm"><p className="font-medium">{solved ? "Correct. Root cause:" : "The root cause:"}</p><p className="mt-1 text-ink-2">{inc.rootCause}</p></div>}
          </section>
        )}

        {base && unlocked && (
          <section className={card} aria-label="Fix">
            <p className="eyebrow">4 · Fix it, then prove it</p>
            <p className="mt-2 text-sm text-ink-2">Change the system below and re-run the <em>same</em> incident (same traffic, same fault, same random seed). Success means the goal is met, not that a number moved.</p>
            <div className="mt-4"><Levers s={setup} onChange={(s) => { setSetup(s); }} /></div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={rerun} className={primary} disabled={!changed}>Re-run with my changes</button>
              <button type="button" onClick={() => { setSetup(cloneSetup(original)); setAfter(null); }} className={ghost} disabled={!changed}>Undo my changes</button>
              <button type="button" onClick={() => setShowFixes((v) => !v)} className="h-10 px-3 text-sm text-ink-2 hover:text-ink" aria-expanded={showFixes}>Stuck? Show known fixes</button>
            </div>
            {showFixes && <ul className="mt-3 space-y-1.5 text-sm" aria-label="Known fixes">{inc.fixes.map((f) => <li key={f.name}><button type="button" className="u-link text-left" onClick={() => { const s = cloneSetup(original); f.apply(s); setSetup(s); setAfter(null); }}>Apply: {f.name}</button></li>)}</ul>}
            {after && base && <div className="mt-5"><Compare before={base} after={after} slo={inc.slo} faults={faults} /></div>}
            {after && !evaluate(inc.slo, after, faults).pass && wrong >= 0 && <p className="mt-3 text-xs text-ink-3">Tip: read the observation again. Which component saturates first, and what would relieve exactly that?</p>}
          </section>
        )}

        {after && <Report r={after} setup={setup} label="5 · After your change" />}
      </div>
    </div>
  );
}

function Open() {
  const GRAPHS = { plain: { name: "Load balancer, 2 API servers, database", g: () => webGraph() }, cache: { name: "… with a cache (80% hit rate)", g: () => webGraph({ cacheHit: 0.8 }) }, async: { name: "… with a queue and worker", g: () => webGraph({ cacheHit: 0.8, worker: true }) } } as const;
  const [gk, setGk] = useState<keyof typeof GRAPHS>("cache");
  const [setup, setSetup] = useState<Setup>(() => ({ graph: GRAPHS.cache.g(), load: { ...LOAD_DEFAULTS, rps: 200, seconds: 40, faults: [{ node: "d", kind: "slow", at: 10, until: 25, value: 6 }] } }));
  const [res, setRes] = useState<LoadResult | null>(null);
  const [prev, setPrev] = useState<LoadResult | null>(null);
  const [f, setF] = useState<{ node: string; kind: FaultKind; at: number; until: number; value: number }>({ node: "d", kind: "slow", at: 10, until: 25, value: 6 });
  const targets = setup.graph.nodes.filter((n) => n.kind !== "client");
  const faults = setup.load.faults ?? [];
  const name = (idn: string) => setup.graph.nodes.find((n) => n.id === idn)?.label ?? idn;
  const upd = (fn: (s: Setup) => void) => { const c = cloneSetup(setup); fn(c); setSetup(c); };
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
  const run = () => { setPrev(res); setRes(runSetup(setup)); };
  const input = "mt-1 h-9 w-full rounded-lg border border-line-strong bg-bg px-2";

  return (
    <div className="space-y-5">
      <section className={card} aria-label="Experiment setup">
        <p className="eyebrow">Set up the experiment</p>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <label className="sm:col-span-2">System<select value={gk} onChange={(e) => { const k = e.target.value as keyof typeof GRAPHS; setGk(k); setSetup({ graph: GRAPHS[k].g(), load: { ...setup.load, faults: [] } }); setRes(null); setPrev(null); setF({ ...f, node: "d" }); }} className={input}>{Object.entries(GRAPHS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
          <label>Requests/s<input type="number" min={10} max={600} value={setup.load.rps} onChange={(e) => upd((s) => { s.load.rps = num(e.target.value, 10, 600); })} className={input} /></label>
          <label>Duration (s)<input type="number" min={20} max={60} value={setup.load.seconds} onChange={(e) => upd((s) => { s.load.seconds = num(e.target.value, 20, 60); })} className={input} /></label>
        </div>
        <fieldset className="mt-4 rounded-xl border border-line p-3"><legend className="px-1 text-xs uppercase tracking-wider text-ink-3">Inject a fault</legend>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
            <label className="sm:col-span-2">Component<select value={f.node} onChange={(e) => setF({ ...f, node: e.target.value })} className={input}>{targets.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
            <label className="sm:col-span-2">What goes wrong<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as FaultKind })} className={input}>{FAULT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
            <label>From (s)<input type="number" min={0} max={55} value={f.at} onChange={(e) => setF({ ...f, at: num(e.target.value, 0, 55) })} className={input} /></label>
            <label>Until (s)<input type="number" min={1} max={60} value={f.until} onChange={(e) => setF({ ...f, until: num(e.target.value, 1, 60) })} className={input} /></label>
            {FAULT_KINDS.find((k) => k.value === f.kind)?.hint && <label className="sm:col-span-2">{FAULT_KINDS.find((k) => k.value === f.kind)!.hint}<input type="number" min={0} max={100} step="any" value={f.value} onChange={(e) => setF({ ...f, value: num(e.target.value, 0, 100) })} className={input} /></label>}
          </div>
          <button type="button" onClick={() => f.until > f.at && upd((s) => { s.load.faults = [...(s.load.faults ?? []), { node: f.node, kind: f.kind, at: f.at, until: f.until, ...(["slow", "errors", "cache-cold"].includes(f.kind) ? { value: f.value } : {}) } as Fault]; })} disabled={f.until <= f.at} className={`${ghost} mt-3`}>Add fault</button>
          <ul className="mt-3 space-y-1 text-sm" aria-label="Faults in this experiment">{faults.length === 0 && <li className="text-ink-3">No faults: a healthy baseline.</li>}
            {faults.map((x, i) => <li key={i} className="flex items-center justify-between rounded-lg bg-bg-2 px-3 py-1.5"><span>{name(x.node)}: {FAULT_KINDS.find((k) => k.value === x.kind)!.label.split(" (")[0]}{x.value !== undefined ? ` (${x.value})` : ""}, {x.at}s to {x.until}s</span><button type="button" onClick={() => upd((s) => { s.load.faults = (s.load.faults ?? []).filter((_, j) => j !== i); })} className="text-xs text-ink-2 hover:text-warn" aria-label={`Remove fault ${i + 1}`}>Remove</button></li>)}</ul>
        </fieldset>
        <div className="mt-4"><Levers s={setup} onChange={setSetup} /></div>
        <div className="mt-4"><button type="button" onClick={run} className={primary}>{res ? "Run again" : "Run experiment"}</button></div>
      </section>
      {res && <Report r={res} setup={setup} label="Result" />}
      {res && prev && <section className={card} aria-label="Compare with the previous run"><p className="eyebrow">Previous run vs this run</p><div className="mt-3"><Compare before={prev} after={res} slo={{ minSuccess: 0.95 }} faults={faults} beforeLabel="Previous" afterLabel="This run" /></div></section>}
    </div>
  );
}

export function BreakItLab() {
  const [mode, setMode] = useState<"guided" | "open">("guided");
  return (
    <div>
      <div role="tablist" aria-label="Mode" className="mb-6 inline-flex rounded-full border border-line p-1 text-sm">
        {([["guided", "Guided incidents"], ["open", "Open experiment"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} type="button" onClick={() => setMode(k)} className={clsx("rounded-full px-4 py-1.5 transition", mode === k ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}>{l}</button>)}
      </div>
      {mode === "guided" ? <Guided /> : <Open />}
      <details className="mt-8 rounded-2xl border border-line p-4 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">What this model simplifies</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>It is deterministic and seeded: the same setup always gives the same run, so before and after are a fair comparison.</li>
          <li>Each component serves a fixed number of requests at once with a fixed service time. Real systems slow down as they get busy (contention, garbage collection, cache misses in the CPU).</li>
          <li>An API server holds its slot while it waits for a dependency. A client timeout abandons the request, but the servers keep working on it (this is why overload feeds on itself).</li>
          <li>Hung connections last 60 s, as with an unbounded socket timeout. Queues are first-in-first-out and unbounded unless you set a limit.</li>
          <li>Not modelled: partial failure (some requests slow, others fine), retries inside the servers, multiple regions, autoscaling, correlated failures, human reaction time.</li>
        </ul>
      </details>
    </div>
  );
}
