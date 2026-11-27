"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { programScenario, EVENT_LOOP_SPEC } from "@/sim/eventloop";
import { parseProgram, type ParseError } from "@/lib/playground/parse";
import { runInSandbox } from "@/lib/playground/sandbox";

const EXAMPLES: { id: string; name: string; code: string }[] = [
  { id: "basic", name: "Timer vs promise", code: "console.log('start');\nsetTimeout(() => console.log('timeout'), 0);\nPromise.resolve().then(() => console.log('promise'));\nconsole.log('end');" },
  { id: "async", name: "async / await", code: "async function f() {\n  console.log('f start');\n  await null;\n  console.log('f after await');\n}\nconsole.log('before');\nf();\nPromise.resolve().then(() => console.log('promise'));\nconsole.log('after');" },
  { id: "nested", name: "Microtask inside a timer", code: "setTimeout(() => {\n  console.log('timer 1');\n  Promise.resolve().then(() => console.log('microtask from timer 1'));\n}, 0);\nsetTimeout(() => console.log('timer 2'), 0);" },
  { id: "tick", name: "nextTick (Node only)", code: "Promise.resolve().then(() => console.log('promise'));\nprocess.nextTick(() => console.log('nextTick'));\nconsole.log('sync');" },
];

interface Result {
  program: boolean; errors: ParseError[]; model: string[]; browser: string[] | null; browserError: string | null; nodeOnly: string[];
  steps: { label: string; explain: string }[]; ran: string;
}
const norm = (s: string) => s.replace(/\s+$/, "");

export function EventLoopPlayground() {
  const [code, setCode] = useState(EXAMPLES[0]!.code);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    const p = parseProgram(code);
    if (!p.ok) { setRes({ program: false, errors: p.errors, model: [], browser: null, browserError: null, nodeOnly: [], steps: [], ran: code }); setBusy(false); return; }
    const steps = programScenario(p.program, 1, 5);
    const model = steps[steps.length - 1]!.state.out;
    let browser: string[] | null = null, browserError: string | null = null;
    if (!p.nodeOnly.length) { const r = await runInSandbox(code, p.maxDelay); browser = r.lines; browserError = r.error ?? (r.unavailable ? "Not available here." : null); }
    setRes({ program: true, errors: [], model, browser, browserError, nodeOnly: p.nodeOnly, steps: steps.map((s) => ({ label: s.label, explain: s.explain })), ran: code });
    setBusy(false);
  }

  const guessLines = useMemo(() => guess.split("\n").map(norm).filter((l) => l.length), [guess]);
  const rows = res?.program ? Math.max(res.model.length, res.browser?.length ?? 0, guessLines.length) : 0;
  const modelVsBrowser = res?.browser ? res.model.length === res.browser.length && res.model.every((l, i) => l === res.browser![i]) : null;
  const firstDiff = res?.browser ? Array.from({ length: Math.max(res.model.length, res.browser.length) }, (_, i) => i).find((i) => res.model[i] !== res.browser![i]) : undefined;
  const guessOk = res?.program && guessLines.length ? guessLines.length === res.model.length && guessLines.every((l, i) => l === res.model[i]) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Examples">
          <span className="text-sm text-ink-3">Examples</span>
          {EXAMPLES.map((e) => <button key={e.id} type="button" onClick={() => { setCode(e.code); setRes(null); }} className="h-8 rounded-full border border-line px-3 text-sm text-ink-2 hover:border-ink hover:text-ink">{e.name}</button>)}
        </div>
        <label htmlFor="pg-code" className="mt-4 block text-sm font-medium">Program</label>
        <textarea id="pg-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} rows={14} maxLength={4000} aria-describedby="pg-help"
          className="mt-1 w-full resize-y rounded-xl border border-line-strong code p-3 text-[0.82rem] leading-relaxed outline-none focus:border-signal" />
        <p id="pg-help" className="mt-1 text-xs text-ink-3">Only the supported subset runs: console.log, setTimeout, setImmediate, process.nextTick, queueMicrotask, Promise.resolve().then, and async functions with await. Anything else is rejected with its line number.</p>
        <label htmlFor="pg-guess" className="mt-4 block text-sm font-medium">Your prediction <span className="font-normal text-ink-3">(optional, one output per line)</span></label>
        <textarea id="pg-guess" value={guess} onChange={(e) => setGuess(e.target.value)} spellCheck={false} rows={5} className="mt-1 w-full resize-y rounded-xl border border-line-strong bg-bg p-3 font-mono text-[0.82rem] outline-none focus:border-signal" placeholder={"start\nend\n..."} />
        <button type="button" onClick={run} disabled={busy} className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-6 font-medium text-bg enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-50">{busy ? "Running…" : "Run"}</button>
      </div>

      <div aria-live="polite" data-testid="pg-result">
        {!res && <p className="rounded-2xl border border-dashed border-line-strong p-6 text-ink-2">Press Run to compare your prediction, the model and a real run in your browser.</p>}
        {res && !res.program && (
          <div role="alert" className="rounded-2xl border border-warn p-5" data-testid="pg-errors">
            <p className="font-medium text-warn">This program can&rsquo;t run here</p>
            <ul className="mt-2 space-y-1 text-sm">{res.errors.map((e, i) => <li key={i}><span className="font-mono text-ink-3">line {e.line}:</span> {e.message}</li>)}</ul>
          </div>)}
        {res?.program && (<>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <table className="w-full text-left font-mono text-[0.8rem]" data-testid="pg-table">
              <thead><tr className="text-ink-3"><th className="w-8 pb-2 font-normal">#</th><th className="pb-2 font-normal">Your guess</th><th className="pb-2 font-normal">Model</th><th className="pb-2 font-normal">Browser run</th></tr></thead>
              <tbody>{Array.from({ length: rows }, (_, i) => {
                const g = guessLines[i], m = res.model[i], b = res.browser?.[i];
                return (<tr key={i} className="border-t border-line align-top">
                  <td className="py-1.5 text-ink-3">{i + 1}</td>
                  <td className={clsx("py-1.5 pr-2", g !== undefined && g !== m && "text-warn")}>{g ?? <span className="text-ink-3">·</span>}</td>
                  <td className="py-1.5 pr-2">{m ?? <span className="text-ink-3">·</span>}</td>
                  <td className={clsx("py-1.5", res.browser && b !== m && "text-warn")}>{res.browser ? (b ?? <span className="text-ink-3">·</span>) : <span className="text-ink-3">n/a</span>}</td>
                </tr>);
              })}</tbody>
            </table>
            <ul className="mt-4 space-y-1.5 text-sm">
              {guessOk !== null && <li className={guessOk ? "text-ok" : "text-warn"}>{guessOk ? "Your prediction matches the model." : "Your prediction differs from the model; the model's reasoning is below."}</li>}
              {modelVsBrowser === true && <li className="text-ok">The model and your browser agree on all {res.model.length} lines.</li>}
              {modelVsBrowser === false && <li className="text-warn">The model and your browser differ at line {(firstDiff ?? 0) + 1}. Either the model simplifies something here or the browser engine behaves differently from Node.</li>}
              {res.browserError && <li className="text-warn">Browser run reported: {res.browserError}</li>}
              {res.nodeOnly.length > 0 && <li className="text-ink-2">Not run in the browser: {res.nodeOnly.join(" and ")} {res.nodeOnly.length > 1 ? "are" : "is"} Node-only. To compare with real Node, save the program as <code>p.js</code> and run <code>node p.js</code>.</li>}
            </ul>
          </div>
          <details className="mt-4 rounded-2xl border border-line p-4 text-sm" data-testid="pg-trace">
            <summary className="cursor-pointer font-medium">How the model got there ({res.steps.length} steps)</summary>
            <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-2">{res.steps.slice(0, 80).map((s, i) => <li key={i}><span className="font-mono text-xs text-signal-ink">{s.label}</span><span className="block text-ink-2">{s.explain}</span></li>)}</ol>
          </details>
        </>)}
        <details className="mt-4 rounded-2xl border border-line p-4 text-sm text-ink-2">
          <summary className="cursor-pointer font-medium text-ink">What this does and does not tell you</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {EVENT_LOOP_SPEC.simplifies.slice(1).map((s, i) => <li key={i}>{s}</li>)}
            <li>The browser run uses your browser&rsquo;s engine, not Node. Promise and timer ordering follow the same rules, so they should agree; browsers also clamp very short nested timers, which this subset does not reach.</li>
            <li>The model&rsquo;s agreement with real Node is checked by the test suite on a set of programs, not proven for every program in the subset.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
