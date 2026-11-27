"use client";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Link2, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { parseParams, parseSeed, toQuery, type Params, type SimSpec, type Step } from "@/sim/engine";
import { SPEEDS, usePlayer } from "./usePlayer";

export interface ViewProps<S> { step: Step<S>; steps: Step<S>[]; index: number; params: Params; reduce: boolean }

/**
 * One shell for every simulation: parameters, transport controls, speed, scrubber,
 * annotation, screen-reader transcript, URL state and the honesty list. A view only draws a step.
 */
export function SimShell<S>({ spec, view: View, embedded = false, href }: { spec: SimSpec<S>; view: (p: ViewProps<S>) => React.ReactNode; embedded?: boolean; href?: string }) {
  const [params, setParams] = useState<Params>(spec.defaults);
  const [ready, setReady] = useState(embedded);
  const [initialStep, setInitialStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [seedState, setSeed] = useState(7);
  const steps = useMemo(() => spec.scenario(params, seedState), [spec, params, seedState]);
  const pl = usePlayer(steps.length, initialStep);
  const step = steps[Math.min(pl.index, steps.length - 1)]!;

  // Read state from the URL once, after hydration (the server renders the defaults).
  useEffect(() => {
    if (embedded) return;
    const q = Object.fromEntries(new URLSearchParams(window.location.search));
    setParams(parseParams(spec.params, spec.defaults, q)); setSeed(parseSeed(q.seed));
    const n = Number(q.step); if (Number.isInteger(n) && n > 0) { setInitialStep(n); }
    setReady(true);
  }, [embedded, spec]);
  useEffect(() => { if (initialStep > 0) pl.seek(initialStep); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialStep, steps.length]);
  // Write it back (replaceState: sharing a link should not fill the back button).
  useEffect(() => {
    if (embedded || !ready) return;
    const qs = new URLSearchParams(toQuery(spec.defaults, params, seedState, pl.index)).toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [embedded, ready, spec, params, seedState, pl.index]);

  const set = (key: string, value: string | number) => { pl.reset(); setInitialStep(0); setParams((p) => ({ ...p, [key]: value })); };
  const copy = useCallback(async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} }, []);

  const stage = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== stage.current) return;
    if (e.key === "ArrowRight") { e.preventDefault(); pl.next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); pl.prev(); }
    else if (e.key === "Home") { e.preventDefault(); pl.reset(); }
    else if (e.key === "End") { e.preventDefault(); pl.seek(pl.last); }
    else if (e.key === " " || e.key === "k") { e.preventDefault(); pl.toggle(); }
  };
  const btn = "grid h-10 w-10 place-items-center rounded-full border border-line transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-line";

  return (
    <section aria-label={`${spec.title} simulation`} className={clsx("not-prose", embedded ? "my-8" : "")}>
      {/* Parameters */}
      <div role="group" aria-label="Parameters" className="grid gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
        {spec.params.map((d) => d.kind === "select" ? (
          <div key={d.key}>
            {d.options.length > 4 ? (<>
              <label htmlFor={`p-${spec.id}-${d.key}`} className="eyebrow">{d.label}</label>
              <select id={`p-${spec.id}-${d.key}`} value={String(params[d.key])} onChange={(e) => set(d.key, e.target.value)} className="mt-2 h-9 w-full rounded-full border border-line bg-bg px-3 text-sm">
                {d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>) : (<>
              <span id={`p-${spec.id}-${d.key}`} className="eyebrow">{d.label}</span>
              <div role="radiogroup" aria-labelledby={`p-${spec.id}-${d.key}`} className="mt-2 flex flex-wrap gap-1.5">
                {d.options.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={params[d.key] === o.value} onClick={() => set(d.key, o.value)}
                    className={clsx("h-9 rounded-full border px-3 text-sm transition-colors", params[d.key] === o.value ? "border-signal bg-signal-wash text-signal-ink" : "border-line text-ink-2 hover:border-line-strong")}>{o.label}</button>
                ))}
              </div>
            </>)}
            {d.hint && <p className="mt-1.5 text-xs leading-snug text-ink-3">{d.hint}</p>}
          </div>
        ) : (
          <div key={d.key}>
            <label htmlFor={`p-${spec.id}-${d.key}`} className="eyebrow flex items-baseline justify-between"><span>{d.label}</span><span className="font-mono normal-case tracking-normal text-ink">{params[d.key]}{d.unit ? ` ${d.unit}` : ""}</span></label>
            <input id={`p-${spec.id}-${d.key}`} type="range" min={d.min} max={d.max} step={d.step} value={Number(params[d.key])} onChange={(e) => set(d.key, Number(e.target.value))} className="mt-3 w-full accent-[var(--signal)]" />
            {d.hint && <p className="mt-1.5 text-xs leading-snug text-ink-3">{d.hint}</p>}
          </div>
        ))}
      </div>

      {/* Stage: focusable so arrow keys work */}
      <div ref={stage} tabIndex={0} onKeyDown={onKey} role="group" aria-label="Simulation stage. Arrow keys step, space plays or pauses, Home resets."
        className="mt-4 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
        <View step={step} steps={steps} index={pl.index} params={params} reduce={pl.reduce} />
      </div>

      {/* Transport */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={pl.prev} disabled={pl.index === 0} aria-label="Previous step" className={btn}><ChevronLeft size={16} /></button>
        <button type="button" onClick={pl.toggle} disabled={pl.reduce} aria-label={pl.playing ? "Pause" : pl.index >= pl.last ? "Replay" : "Play"}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-bg transition enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-40">
          {pl.playing ? <><Pause size={14} />Pause</> : <><Play size={14} />{pl.index >= pl.last ? "Replay" : "Play"}</>}
        </button>
        <button type="button" onClick={pl.next} disabled={pl.index >= pl.last} aria-label="Next step" className={btn}><ChevronRight size={16} /></button>
        <button type="button" onClick={pl.reset} aria-label="Reset to the first step" className={btn}><RotateCcw size={15} /></button>
        <div role="radiogroup" aria-label="Playback speed" className="ml-1 flex rounded-full border border-line p-0.5">
          {SPEEDS.map((s) => <button key={s} type="button" role="radio" aria-checked={pl.speed === s} onClick={() => pl.setSpeed(s)} className={clsx("h-8 rounded-full px-2.5 font-mono text-xs transition-colors", pl.speed === s ? "bg-ink text-bg" : "text-ink-2 hover:text-ink")}>{s}×</button>)}
        </div>
        {!embedded && <button type="button" onClick={copy} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm hover:border-ink">{copied ? <><Check size={14} />Link copied</> : <><Link2 size={14} />Copy link to this state</>}</button>}
        {embedded && href && <Link href={href} className="u-link ml-auto text-sm">Open full lab →</Link>}
      </div>
      {pl.reduce && <p className="mt-2 text-xs text-ink-3">Reduced motion is on, so autoplay is off. Use the step buttons or the arrow keys.</p>}
      <div className="mt-3 flex items-center gap-3">
        <span className="whitespace-nowrap font-mono text-xs text-ink-2 tnum">Step {pl.index + 1} / {steps.length}</span>
        <input type="range" min={0} max={pl.last} step={1} value={pl.index} onChange={(e) => pl.seek(Number(e.target.value))} aria-label="Step scrubber" className="w-full accent-[var(--signal)]" />
      </div>

      {/* Annotation (also the live narration) */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <span className="eyebrow">Step {String(pl.index + 1).padStart(2, "0")}</span>
        <h3 className="font-display mt-2 text-3xl leading-tight">{step.label}</h3>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-2">{step.explain}</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{`Step ${pl.index + 1} of ${steps.length}: ${step.label}. ${step.explain}`}</p>

      <details className="mt-4 rounded-2xl border border-line p-4 text-sm">
        <summary className="cursor-pointer font-medium">Full transcript ({steps.length} steps)</summary>
        <ol className="mt-3 space-y-2">
          {steps.map((s, k) => (
            <li key={s.id}><button type="button" onClick={() => pl.seek(k)} aria-current={k === pl.index ? "step" : undefined} className={clsx("w-full rounded-lg px-3 py-2 text-left leading-snug", k === pl.index ? "bg-bg-2" : "hover:bg-bg-2/60")}>
              <span className="font-medium">{k + 1}. {s.label}.</span> <span className="text-ink-2">{s.explain}</span></button></li>
          ))}
        </ol>
      </details>

      <details className="mt-3 rounded-2xl border border-dashed border-line-strong p-4 text-sm" open={!embedded}>
        <summary className="cursor-pointer font-medium">What this simulation simplifies</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-2">{spec.simplifies.map((x) => <li key={x}>{x}</li>)}</ul>
      </details>
    </section>
  );
}
