"use client";
import { animate, motion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export type Pt = { x: number; y: number };
export interface Layout { w: number; h: number; p: Record<string, Pt> }
export interface FlowNode { label: string; sub?: string; icon: LucideIcon }
export interface FlowLeg { id: string; from: string; to: string }

const LEG_S = 0.95;
const TRIM = 38;
export function legPath(a: Pt, b: Pt, forward: boolean) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = (forward ? 1 : -1) * 20;
  return `M ${a.x} ${a.y} Q ${mx + (-dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`;
}

/** Shared illustrative stage: nodes, faint wires, a self-drawing active wire and a travelling packet. */
export function FlowStage({ L, nodes, legs, i, reduce, caption }: { L: Layout; nodes: Record<string, FlowNode>; legs: FlowLeg[]; i: number; reduce: boolean; caption?: string }) {
  const ids = Object.keys(nodes);
  const rank = (n: string) => ids.indexOf(n);
  const step = legs[Math.min(i, legs.length - 1)]!;
  const pathRef = useRef<SVGPathElement>(null);
  const packet = useRef<SVGGElement>(null);
  const place = useCallback((x: number, y: number) => packet.current?.setAttribute("transform", `translate(${x} ${y})`), []);
  const moving = step.from !== step.to;
  const d = (s: FlowLeg) => legPath(L.p[s.from]!, L.p[s.to]!, rank(s.from) < rank(s.to));

  useEffect(() => {
    const b = L.p[step.to]!;
    if (!moving) { place(b.x, b.y - 50); return; }
    const path = pathRef.current; if (!path) return;
    const len = path.getTotalLength(), span = Math.max(len - 2 * TRIM, 1);
    const at = (v: number) => path.getPointAtLength(TRIM + v * span);
    if (reduce) { const e = at(1); place(e.x, e.y); return; }
    const s0 = at(0); place(s0.x, s0.y);
    const c = animate(0, 1, { duration: LEG_S, ease: [0.45, 0, 0.2, 1], onUpdate: (v) => { const q = at(v); place(q.x, q.y); } });
    return () => c.stop();
  }, [step, L, place, reduce, moving]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface dot-grid" style={{ aspectRatio: `${L.w} / ${L.h}` }}>
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {legs.filter((s) => s.from !== s.to).map((s) => <path key={s.id} d={d(s)} fill="none" stroke="var(--line-strong)" strokeWidth="1.25" strokeDasharray="3 6" />)}
        {legs.slice(0, i).filter((s) => s.from !== s.to).map((s) => <path key={`d-${s.id}`} d={d(s)} fill="none" stroke="var(--trace)" strokeOpacity=".45" strokeWidth="1.5" />)}
        {moving && (<>
          <path ref={pathRef} d={d(step)} fill="none" stroke="none" />
          <motion.path key={`${step.id}-${i}`} d={d(step)} fill="none" stroke="var(--signal)" strokeWidth="2.25" strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: LEG_S, ease: [0.45, 0, 0.2, 1] }} />
        </>)}
      </svg>
      {ids.map((n) => {
        const N = nodes[n]!, live = step.from === n || step.to === n, Icon = N.icon;
        return (
          <div key={n} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(L.p[n]!.x / L.w) * 100}%`, top: `${(L.p[n]!.y / L.h) * 100}%` }}>
            <div className={clsx("relative flex min-w-[5.2rem] flex-col items-center gap-1 rounded-xl border bg-bg px-3.5 py-2.5 transition-colors duration-500", live ? "border-signal text-ink" : "border-line text-ink-2")}>
              {live && !reduce && <span className="pointer-events-none absolute inset-0 rounded-xl border border-signal" style={{ animation: "node-ping 1.6s ease-out infinite" }} />}
              <Icon size={19} strokeWidth={1.6} className={live ? "text-signal-ink" : ""} />
              <span className="font-mono text-[0.72rem]">{N.label}</span>
              {N.sub && <span className="font-mono text-[0.58rem] text-ink-3">{N.sub}</span>}
            </div>
          </div>
        );
      })}
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g ref={packet}><circle r="20" fill="var(--signal)" opacity=".16" /><circle r="10" fill="var(--signal)" opacity=".32" /><circle r="5.5" fill="var(--signal)" stroke="var(--surface)" strokeWidth="1.5" /></g>
      </svg>
      {caption && <div className="absolute left-3 top-3 eyebrow !text-[0.62rem]">{caption}</div>}
    </div>
  );
}
