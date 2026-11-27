"use client";
import { motion, useScroll, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

const HOPS = [["00", "top", "Request"], ["01", "problem", "Problem"], ["02", "philosophy", "Method"], ["03", "curriculum", "Curriculum"], ["04", "labs", "Labs"], ["05", "professor", "Professor"], ["06", "experience", "Experience"], ["07", "response", "Response"]] as const;

/** A wire down the left edge: the packet rides it as you read, one hop per section. */
export function ScrollTrace() {
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll();
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  useEffect(() => {
    const els = HOPS.map(([, id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActive(HOPS.findIndex(([, id]) => id === vis.target.id));
    }, { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.01, 0.5] });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="Page sections" className="pointer-events-none fixed left-5 top-1/2 z-30 hidden h-[56vh] -translate-y-1/2 min-[1500px]:block">
      <div className="absolute inset-y-0 left-[5px] w-px bg-line-strong" />
      <motion.div className="absolute left-[5px] top-0 w-px origin-top bg-signal" style={{ scaleY: fill, height: "100%" }} />
      <ul className="relative flex h-full flex-col justify-between">
        {HOPS.map(([n, id, label], k) => (
          <li key={id} className="pointer-events-auto">
            <a href={`#${id}`} aria-label={`${label} section`} aria-current={k === active ? "true" : undefined} className="group flex items-center gap-3">
              <span className={clsx("h-[11px] w-[11px] rounded-full border-2 transition-all duration-300", k === active ? "scale-125 border-signal bg-signal" : k < active ? "border-signal bg-bg" : "border-line-strong bg-bg")} />
              <span className={clsx("font-mono text-[0.65rem] opacity-0 transition-opacity group-hover:opacity-100", k === active && "opacity-100 text-ink")}>{n} {label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
