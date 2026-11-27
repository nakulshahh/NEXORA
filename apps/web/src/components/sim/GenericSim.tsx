"use client";
import { clsx } from "clsx";
import type { SimSpec } from "@/sim/engine";
import type { GenericState, Tone } from "@/sim/generic";
import { SimShell, type ViewProps } from "./SimShell";

const TONE: Record<Tone, string> = {
  idle: "border-line bg-surface text-ink-3", visit: "border-line-strong bg-surface text-ink", hit: "border-signal bg-signal-wash text-signal-ink",
  miss: "border-warn bg-surface text-warn", evict: "border-warn bg-surface text-warn", field: "border-line-strong bg-surface text-ink", bad: "border-warn bg-surface text-warn",
};
const WORD: Record<Tone, string> = { idle: "idle", visit: "visited", hit: "match", miss: "miss", evict: "evicted", field: "byte", bad: "rejected" };

function View({ step, steps, index }: ViewProps<GenericState>) {
  const s = step.state;
  return (
    <div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <span className="eyebrow">{s.title}</span>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={s.title}>
          {s.cells.map((c, i) => (
            <li key={i} className={clsx("min-w-[4.5rem] rounded-xl border px-3 py-2 text-center font-mono text-xs transition-colors", TONE[c.tone])}>
              <span className="block break-all">{c.label}</span>
              {c.sub && <span className="mt-0.5 block text-[0.65rem] opacity-80">{c.sub}</span>}
              <span className="sr-only"> ({WORD[c.tone]})</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {s.metrics.map((m) => <div key={m.label} className="rounded-2xl border border-line bg-surface p-4"><span className="eyebrow">{m.label}</span><p className="mt-2 font-mono text-2xl tnum">{m.value}</p></div>)}
      </div>
      <div className="code mt-3 rounded-2xl border border-line-strong p-4 text-[0.78rem] leading-relaxed" aria-hidden="true">
        <div className="mb-2 text-[0.62rem] uppercase tracking-widest text-[#8a867b]">trace</div>
        {steps.slice(0, index + 1).slice(-6).map((x, k, a) => <div key={x.id} className={clsx("truncate", k === a.length - 1 ? "text-[#ece8de]" : "text-[#8a867b]")}>{k === a.length - 1 ? "▸ " : "· "}{x.state.line}</div>)}
      </div>
    </div>
  );
}
export function makeGenericSim(spec: SimSpec<GenericState>) {
  return function Sim({ embedded = false }: { embedded?: boolean }) { return <SimShell spec={spec} view={View} embedded={embedded} href={`/labs/${spec.id}`} />; };
}
