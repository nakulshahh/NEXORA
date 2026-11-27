"use client";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { clsx } from "clsx";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Fade/translate in once when scrolled into view. */
export function Reveal({ children, delay = 0, y = 24, className, as = "div", ...rest }:
  { children: React.ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "li" | "section" | "p" } & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  const M = motion[as] as typeof motion.div;
  return (
    <M className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ duration: 0.8, delay, ease: EASE }} {...rest}>
      {children}
    </M>
  );
}

/** Word-by-word masked rise. Text stays a single accessible string via aria-label. */
export function SplitReveal({ text, className, delay = 0, accentFrom, accentClass }:
  { text: string; className?: string; delay?: number; accentFrom?: number; accentClass?: string }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span className={clsx("inline-block", accentFrom !== undefined && i >= accentFrom && accentClass)}
            initial={reduce ? false : { y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: delay + i * 0.07, ease: EASE }}>
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function SectionHead({ index, eyebrow, title, children, className }:
  { index: string; eyebrow: string; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("max-w-3xl", className)}>
      <Reveal className="flex items-center gap-3"><span className="font-mono text-xs text-signal-ink">{index}</span><span className="h-px w-8 bg-line-strong" /><span className="eyebrow">{eyebrow}</span></Reveal>
      <Reveal delay={0.08} as="div"><h2 className="font-display mt-5 text-[clamp(2.4rem,5.6vw,4.6rem)] leading-[1.02]">{title}</h2></Reveal>
      {children && <Reveal delay={0.16} className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{children}</Reveal>}
    </div>
  );
}
