"use client";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";

export function Final() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 25%"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [56, 24]);
  return (
    <section ref={ref} id="response" data-hop="07" className="px-3 pb-3 pt-24 md:px-5 md:pb-5 md:pt-32">
      <motion.div style={reduce ? { borderRadius: 24 } : { scale, borderRadius: radius }} className="relative mx-auto max-w-[88rem] overflow-hidden bg-ink px-6 py-24 text-bg md:px-14 md:py-36 [--signal:#ff6b3d]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:items-end">
         <div>
          <p className="font-mono text-xs tracking-[0.2em] text-bg/60">HTTP/1.1 · RESPONSE</p>
          <h2 className="font-display mt-6 text-[clamp(4.5rem,16vw,15rem)] leading-[0.85]"><span className="text-[#ff6b3d]">200</span> <span className="italic">OK</span></h2>
          <p className="mt-8 max-w-xl font-display text-[clamp(1.6rem,3vw,2.6rem)] leading-tight text-bg/90">Your first request is waiting. Follow it all the way down.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/learn/foundations/0.2" className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#ff6b3d] pl-6 pr-2 font-medium text-[#12110e] transition hover:bg-white">
              Begin with networking<span className="grid h-8 w-8 place-items-center rounded-full bg-[#12110e] text-white transition group-hover:translate-x-0.5"><ArrowRight size={15} /></span>
            </Link>
            <Link href="/roadmap" className="inline-flex h-12 items-center rounded-full border border-bg/30 px-6 transition hover:border-bg">See the whole roadmap</Link>
          </div>
         </div>
          <pre aria-hidden="true" className="hidden rounded-2xl border border-bg/15 bg-bg/[0.04] p-6 font-mono text-[0.82rem] leading-7 text-bg/80 lg:block"><span className="text-[#7fe0b0]">HTTP/1.1 200 OK</span>{"\n"}content-type: text/lesson{"\n"}x-first-principles: true{"\n"}x-frameworks-required: 0{"\n\n"}{"{ "}<span className="text-[#93a5ff]">&quot;next&quot;</span>: <span className="text-[#ff8a63]">&quot;0.2 Networking essentials&quot;</span>{" }"}</pre>
        </div>
      </motion.div>
    </section>
  );
}
