"use client";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { EVENT_LOOP_SPEC, sourceOf, type ELState, type Item } from "@/sim/eventloop";
import { SimShell, type ViewProps } from "./SimShell";

function Queue({ title, sub, items, tone = "ink", reverse = false, empty = "empty" }: { title: string; sub: string; items: (Item & { meta?: string })[]; tone?: "ink" | "signal" | "trace"; reverse?: boolean; empty?: string }) {
  return (
    <div className="flex min-h-[7.5rem] flex-col rounded-xl border border-line bg-bg p-3">
      <div className="flex items-baseline justify-between gap-2"><span className="eyebrow">{title}</span><span className="font-mono text-[0.6rem] text-ink-3">{sub}</span></div>
      <ul className={clsx("mt-2 flex flex-1 gap-1.5", reverse ? "flex-col-reverse justify-end" : "flex-col")} aria-label={`${title}: ${items.length ? items.map((i) => i.label).join(", ") : "empty"}`}>
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.li key={it.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.25 }}
              className={clsx("flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[0.72rem]", tone === "signal" ? "border-signal bg-signal-wash text-signal-ink" : tone === "trace" ? "border-trace/50 bg-trace-wash" : "border-line-strong bg-surface")}>
              <span className="truncate">{it.label}</span>{it.meta && <span className="shrink-0 text-ink-3">{it.meta}</span>}
            </motion.li>
          ))}
        </AnimatePresence>
        {!items.length && <li className="font-mono text-[0.68rem] text-ink-3">{empty}</li>}
      </ul>
    </div>
  );
}

const PHASES = [["timers", "timers"], ["poll", "poll (I/O)"], ["check", "check (setImmediate)"]] as const;

function View({ step, params }: ViewProps<ELState>) {
  const s = step.state;
  const lines = sourceOf(params).split("\n");
  const inMicro = s.phase === "ticks" || s.phase === "microtasks";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[1.15fr_1fr_1fr]">
      <div className="min-w-0 space-y-3">
        <div className="code overflow-hidden rounded-2xl border border-line-strong text-[0.8rem]">
          <div className="border-b border-white/10 px-4 py-2 font-mono text-[0.68rem] text-[#8a867b]">program.js (CommonJS)</div>
          <pre className="overflow-x-auto py-3 leading-[1.7]"><code>{lines.map((l, n) => (
            <span key={n} className={clsx("flex px-4", s.line === n + 1 && "bg-[#ff6b3d]/20 shadow-[inset_2px_0_0_#ff6b3d]")}>
              <span aria-hidden="true" className="mr-3 w-4 shrink-0 select-none text-right text-[#6a665c]">{n + 1}</span><span className="whitespace-pre text-[#ece8de]">{l || " "}</span>
            </span>))}</code></pre>
        </div>
        <div className="code rounded-2xl border border-line-strong p-4 text-[0.8rem]" aria-label={`Console output: ${s.out.join(", ") || "nothing yet"}`}>
          <div className="mb-2 text-[0.62rem] uppercase tracking-widest text-[#8a867b]">console</div>
          {s.out.length ? s.out.map((o, k) => <div key={k} className={k === s.out.length - 1 ? "text-[#ece8de]" : "text-[#8a867b]"}><span className="mr-2 text-[#6a665c]">{k + 1}</span>{o}</div>) : <span className="text-[#6a665c]">(no output yet)</span>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <Queue title="Call stack" sub="running now" items={s.stack.map((x) => ({ id: x, label: x }))} tone="signal" reverse empty="idle" />
        <Queue title="process.nextTick queue" sub="drained first" items={s.ticks} tone={s.phase === "ticks" ? "signal" : "ink"} />
        <Queue title="Microtask queue" sub="promise jobs" items={s.micro} tone={s.phase === "microtasks" ? "signal" : "ink"} />
        {inMicro && <p className="px-1 font-mono text-[0.68rem] text-signal-ink">Between callbacks: ticks, then microtasks.</p>}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="rounded-xl border border-line bg-bg p-3">
          <div className="flex items-baseline justify-between"><span className="eyebrow">Event loop</span><span className="font-mono text-xs tnum" aria-label={`Virtual clock ${s.clock} milliseconds`}>t = {s.clock} ms</span></div>
          <ol className="mt-2 space-y-1">{PHASES.map(([id, label]) => (
            <li key={id} aria-current={s.phase === id ? "step" : undefined} className={clsx("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[0.72rem] transition-colors", s.phase === id ? "border-signal bg-signal-wash text-signal-ink" : "border-line text-ink-3")}>
              <i className={clsx("h-1.5 w-1.5 rounded-full", s.phase === id ? "bg-signal" : "bg-line-strong")} />{label}</li>))}</ol>
        </div>
        <Queue title="Timers" sub="due at" items={s.timers.map((t) => ({ ...t, meta: `${t.due} ms` }))} tone="trace" />
        <Queue title="Pending I/O" sub="ready at" items={s.io.map((t) => ({ ...t, meta: `${t.ready} ms` }))} tone="trace" />
        <Queue title="setImmediate queue" sub="check phase" items={s.immediates} tone="trace" />
      </div>
    </div>
  );
}
export function EventLoopSim({ embedded = false }: { embedded?: boolean }) { return <SimShell spec={EVENT_LOOP_SPEC} view={View} embedded={embedded} href="/labs/event-loop" />; }
