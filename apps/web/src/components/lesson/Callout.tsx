import { AlertTriangle, Info, Lightbulb, Scale, Server } from "lucide-react";
import { clsx } from "clsx";

const KINDS = {
  why: { icon: Lightbulb, label: "Why it exists", cls: "border-signal/50 bg-signal-wash", ic: "text-signal-ink" },
  mistake: { icon: AlertTriangle, label: "Common mistake", cls: "border-warn/50 bg-bg-2", ic: "text-warn" },
  tradeoff: { icon: Scale, label: "Trade-off", cls: "border-trace/40 bg-trace-wash", ic: "text-trace" },
  prod: { icon: Server, label: "In production", cls: "border-line-strong bg-surface", ic: "text-ink-2" },
  note: { icon: Info, label: "Note", cls: "border-line bg-bg-2", ic: "text-ink-2" },
} as const;

export function Callout({ kind, children }: { kind: keyof typeof KINDS; children: React.ReactNode }) {
  const K = KINDS[kind];
  return (
    <aside className={clsx("my-7 rounded-xl border p-5", K.cls)}>
      <p className={clsx("eyebrow flex items-center gap-2", K.ic)}><K.icon size={14} />{K.label}</p>
      <div className="mt-2 text-[0.98rem] leading-relaxed [&>p+p]:mt-3">{children}</div>
    </aside>
  );
}
