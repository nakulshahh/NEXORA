import { clsx } from "clsx";

/** Two nodes joined by a wire, with the "packet" in transit — the NEXORA mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={clsx("h-6 w-6", className)} aria-hidden="true">
      <path d="M5 21 C 11 21, 11 7, 23 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="21" r="3" fill="currentColor" />
      <circle cx="23" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="14" r="2.6" fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-mono text-[0.95rem] font-semibold tracking-[0.22em]">NEXORA</span>
    </span>
  );
}
