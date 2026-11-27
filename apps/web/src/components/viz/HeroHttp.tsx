"use client";
import { animate, motion, useReducedMotion } from "motion/react";
import { Database, Globe, Pause, Play, RotateCcw, Server, SkipForward, Waypoints, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { useMedia } from "@/lib/useMedia";
import { buildHttpSteps, GROUPS, type HttpStep, type NodeId } from "./httpSteps";

type Pt = { x: number; y: number };
const LAYOUT = {
  wide: { w: 1000, h: 440, p: { browser: { x: 96, y: 220 }, dns: { x: 316, y: 84 }, server: { x: 556, y: 220 }, cache: { x: 868, y: 84 }, db: { x: 868, y: 356 } } as Record<NodeId, Pt> },
  tall: { w: 360, h: 700, p: { browser: { x: 84, y: 64 }, dns: { x: 276, y: 168 }, server: { x: 84, y: 340 }, cache: { x: 276, y: 486 }, db: { x: 276, y: 636 } } as Record<NodeId, Pt> },
};
const RANK: Record<NodeId, number> = { browser: 0, dns: 1, server: 2, cache: 3, db: 4 };
const META: Record<NodeId, { label: string; icon: typeof Globe }> = {
  browser: { label: "Browser", icon: Globe }, dns: { label: "DNS", icon: Waypoints }, server: { label: "Server", icon: Server },
  cache: { label: "Redis", icon: Zap }, db: { label: "Postgres", icon: Database },
};

function legPath(a: Pt, b: Pt, forward: boolean) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = (forward ? 1 : -1) * 22;
  return `M ${a.x} ${a.y} Q ${mx + (-dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`;
}

const TRIM = 40; // packet stops at the node edge, not on top of its label
const REST_Y = 52;
const LEG_MS = 1150;
const SELF_MS = 1050;
const HOLD_MS = 2600;

export function HeroHttp() {
  const reduce = useReducedMotion();
  const wide = useMedia("(min-width: 820px)", true);
  const L = wide ? LAYOUT.wide : LAYOUT.tall;

  const [dnsWarm, setDnsWarm] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const steps = useMemo(() => buildHttpSteps({ dnsWarm, cacheHit }), [dnsWarm, cacheHit]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(i, steps.length - 1)]!;

  // Autoplay only while on screen, never under reduced motion.
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setStarted(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);
  useEffect(() => { setI(0); }, [dnsWarm, cacheHit]);

  useEffect(() => {
    if (!playing || !started) return;
    const last = i >= steps.length - 1;
    const t = setTimeout(() => setI(last ? 0 : i + 1), last ? HOLD_MS : step.from === step.to ? SELF_MS : LEG_MS);
    return () => clearTimeout(t);
  }, [i, playing, started, steps.length, step]);

  // Packet travelling along the current leg (direct DOM writes — no re-render per frame).
  const pathRef = useRef<SVGPathElement>(null);
  const packetRef = useRef<SVGGElement>(null);
  const place = useCallback((x: number, y: number) => packetRef.current?.setAttribute("transform", `translate(${x} ${y})`), []);
  useEffect(() => {
    const b = L.p[step.to];
    if (step.from === step.to) { place(b.x, b.y - REST_Y); return; }
    const path = pathRef.current; if (!path) return;
    const len = path.getTotalLength(), span = Math.max(len - 2 * TRIM, 1);
    const at = (v: number) => path.getPointAtLength(TRIM + v * span);
    const end = at(1);
    if (reduce) { place(end.x, end.y); return; }
    const s0 = at(0); place(s0.x, s0.y);
    const c = animate(0, 1, { duration: (LEG_MS - 150) / 1000, ease: [0.45, 0, 0.2, 1], onUpdate: (v) => { const q = at(v); place(q.x, q.y); } });
    return () => c.stop();
  }, [step, L, place, reduce]);

  const total = steps.reduce((s, x) => s + x.ms, 0);
  const done = steps.slice(0, i + 1).reduce((s, x) => s + x.ms, 0);
  const starts = useMemo(() => { let c = 0; return steps.map((s) => { const v = c; c += s.ms; return v; }); }, [steps]);
  const pos = (n: NodeId) => ({ left: `${(L.p[n].x / L.w) * 100}%`, top: `${(L.p[n].y / L.h) * 100}%` });
  const activeNodes = new Set<NodeId>([step.from, step.to]);

  const logLines = useMemo(() => steps.slice(0, i + 1).flatMap((s, si) => s.wire.map((w, wi) => ({ ...w, key: `${s.id}-${wi}`, fresh: si === i }))), [steps, i]);

  return (
    <div ref={rootRef} className="w-full">
      {/* Stage */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface dot-grid" style={{ aspectRatio: `${L.w} / ${L.h}` }}>
        <svg viewBox={`0 0 ${L.w} ${L.h}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* every wire used by the current scenario, faint */}
          {steps.filter((s) => s.from !== s.to).map((s) => (
            <path key={s.id} d={legPath(L.p[s.from], L.p[s.to], RANK[s.from] < RANK[s.to])} fill="none" stroke="var(--line-strong)" strokeWidth="1.25" strokeDasharray="3 6" />
          ))}
          {/* completed wires, trace colour */}
          {steps.slice(0, i).filter((s) => s.from !== s.to).map((s) => (
            <path key={`d-${s.id}`} d={legPath(L.p[s.from], L.p[s.to], RANK[s.from] < RANK[s.to])} fill="none" stroke="var(--trace)" strokeOpacity=".45" strokeWidth="1.5" />
          ))}
          {/* active wire draws itself */}
          {step.from !== step.to && (
            <>
              <path ref={pathRef} d={legPath(L.p[step.from], L.p[step.to], RANK[step.from] < RANK[step.to])} fill="none" stroke="none" />
              <motion.path key={`a-${step.id}-${i}`} d={legPath(L.p[step.from], L.p[step.to], RANK[step.from] < RANK[step.to])} fill="none" stroke="var(--signal)" strokeWidth="2.25" strokeLinecap="round"
                initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: (LEG_MS - 150) / 1000, ease: [0.45, 0, 0.2, 1] }} />
            </>
          )}
        </svg>

        {(Object.keys(META) as NodeId[]).map((n) => {
          const Icon = META[n].icon; const live = activeNodes.has(n);
          const inside = step.from === step.to && step.to === n;
          const hidden = (n === "dns" && dnsWarm) ;
          return (
            <div key={n} className="absolute -translate-x-1/2 -translate-y-1/2" style={pos(n)}>
              <div className={clsx("relative flex flex-col items-center gap-1.5 rounded-xl border bg-bg px-4 py-3 transition-colors duration-500", live ? "border-signal text-ink" : "border-line text-ink-2", hidden && "opacity-45")}>
                {live && !reduce && <span className="pointer-events-none absolute inset-0 rounded-xl border border-signal" style={{ animation: "node-ping 1.6s ease-out infinite" }} />}
                <Icon size={20} strokeWidth={1.6} className={live ? "text-signal-ink" : ""} />
                <span className="font-mono text-[0.74rem] tracking-wide">{META[n].label}</span>
                {n === "server" && (
                  <div className="mt-0.5 hidden gap-1 sm:flex" aria-hidden="true">
                    {["auth", "valid", "route"].map((m, mi) => (
                      <span key={m} className={clsx("rounded border px-1 font-mono text-[0.58rem] transition-colors", step.id === "mw" ? "border-signal bg-signal-wash text-signal-ink" : "border-line text-ink-3")}
                        style={step.id === "mw" && !reduce ? { transitionDelay: `${mi * 220}ms` } : undefined}>{m}</span>
                    ))}
                  </div>
                )}
                {inside && <span className="absolute -bottom-5 whitespace-nowrap font-mono text-[0.6rem] text-signal-ink">working…</span>}
              </div>
            </div>
          );
        })}

        <svg viewBox={`0 0 ${L.w} ${L.h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <g ref={packetRef} transform={`translate(${L.p.browser.x} ${L.p.browser.y})`}>
            <circle r="20" fill="var(--signal)" opacity=".16" />
            <circle r="10" fill="var(--signal)" opacity=".32" />
            <circle r="5.5" fill="var(--signal)" stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        </svg>

        {step.from !== step.to && (
          <motion.span key={`ms-${step.id}-${i}`} initial={reduce ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, duration: 0.35 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal bg-bg px-2 py-0.5 font-mono text-[0.66rem] text-signal-ink tnum"
            style={{ left: `${(((L.p[step.from].x + L.p[step.to].x) / 2) / L.w) * 100}%`, top: `${(((L.p[step.from].y + L.p[step.to].y) / 2) / L.h) * 100}%` }}>{step.ms} ms</motion.span>
        )}
        <div className="absolute left-3 top-3 eyebrow !text-[0.62rem]">Illustrative loop · the real lab has parameters</div>
        <div className="absolute bottom-3 right-3 font-mono text-xs tnum text-ink-2" aria-hidden="true">t = <span className="text-ink">{done.toFixed(done < 10 ? 1 : 0)}</span> ms</div>
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause animation" : "Play animation"}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg transition hover:bg-signal hover:text-white">
          {playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause" : "Play"}
        </button>
        <button type="button" aria-label="Next step" onClick={() => { setPlaying(false); setI((x) => (x + 1) % steps.length); }} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-line-strong"><SkipForward size={14} /></button>
        <button type="button" aria-label="Restart" onClick={() => setI(0)} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-line-strong"><RotateCcw size={14} /></button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <Toggle on={dnsWarm} set={setDnsWarm} label="DNS cached" />
        <Toggle on={cacheHit} set={setCacheHit} label="Redis hit" />
      </div>

      <p className="sr-only" aria-live="polite">{`Step ${i + 1} of ${steps.length}: ${step.title}. ${step.note}`}</p>

      {/* Explanation + wire + waterfall */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between"><span className="eyebrow">Step {String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span><span className="font-mono text-xs text-ink-3">{step.group}</span></div>
          <motion.h3 key={step.id + i} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="mt-3 font-display text-3xl leading-tight">{step.title}</motion.h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{step.note}</p>
          <div className="code mt-4 flex h-[9.5rem] border border-line-strong flex-col justify-end overflow-hidden rounded-xl p-3 text-[0.78rem] leading-relaxed" role="log" aria-label="Wire log">
            {logLines.slice(-6).map((l) => (
              <motion.div key={l.key} initial={l.fresh && !reduce ? { opacity: 0, x: -6 } : false} animate={{ opacity: l.fresh ? 1 : 0.55, x: 0 }} className="truncate">
                <span className={l.dir === "out" ? "text-[#93a5ff]" : l.dir === "in" ? "text-[#7fe0b0]" : "text-[#8a867b]"}>{l.dir === "out" ? "→ " : l.dir === "in" ? "← " : "· "}</span>{l.text}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between"><span className="eyebrow">Latency waterfall</span><span className="font-mono text-xs tnum text-ink-2">{total.toFixed(1)} ms total</span></div>
          <ul className="mt-4 space-y-2.5">
            {GROUPS.filter((g) => steps.some((s) => s.group === g)).map((g) => (
              <li key={g} className="grid grid-cols-[4.6rem_1fr_3.2rem] items-center gap-3 text-xs">
                <span className="font-mono text-ink-2">{g}</span>
                <span className="relative h-3 rounded-sm bg-bg-2">
                  {steps.map((s, si) => s.group === g && (
                    <motion.span key={s.id} className={clsx("absolute inset-y-0 origin-left rounded-sm", si === i ? "bg-signal" : "bg-trace/70")}
                      style={{ left: `${(starts[si]! / total) * 100}%`, width: `${Math.max((s.ms / total) * 100, 1.2)}%` }}
                      initial={false} animate={{ opacity: si <= i ? 1 : 0.12, scaleX: si <= i ? 1 : 0.2 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} />
                  ))}
                </span>
                <span className="text-right font-mono tnum text-ink-2">{steps.filter((s) => s.group === g).reduce((a, s) => a + s.ms, 0).toFixed(1)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
            {cacheHit ? "A warm cache removes the database from the critical path entirely." : dnsWarm ? "Skipping DNS saves a network round trip before the first byte." : "Toggle the caches and watch where the milliseconds go."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)}
      className={clsx("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors", on ? "border-signal bg-signal-wash text-signal-ink" : "border-line text-ink-2 hover:border-line-strong")}>
      <span className={clsx("relative h-4 w-7 rounded-full transition-colors", on ? "bg-signal" : "bg-line-strong")}>
        <span className={clsx("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>{label}
    </button>
  );
}

export type { HttpStep };
