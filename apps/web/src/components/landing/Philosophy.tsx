"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { SectionHead, EASE } from "../motion";

const TOPICS = [
  { id: "cache", name: "Caching", problem: "The same row is read 4,000 times a second and the database sweats.", mechanism: "Keep hot data in memory. Decide what to evict when memory runs out, and when stored data stops being true.", framework: 'await redis.get(`user:${id}`)' },
  { id: "auth", name: "Authentication", problem: "HTTP forgets you between requests, yet the app must know who you are.", mechanism: "Hand the client a token the server can verify. Choose where the state lives, and what it costs to revoke it.", framework: "app.use(passport.authenticate('jwt'))" },
  { id: "queue", name: "Queues", problem: "Sending an email inside a request makes users wait for someone else's server.", mechanism: "Write the work down, answer immediately, and let a worker retry it until it sticks.", framework: "await queue.add('welcome-email', { userId })" },
] as const;

export function Philosophy() {
  const [t, setT] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const reduce = useReducedMotion();
  const cols = [{ k: "Problem", v: t.problem }, { k: "Mechanism", v: t.mechanism }, { k: "Framework", v: t.framework, code: true }];
  return (
    <section id="philosophy" data-hop="02" className="border-y border-line bg-bg-2/60">
      <div className="mx-auto max-w-[88rem] px-5 py-28 md:px-8 md:py-36">
        <SectionHead index="02" eyebrow="First principles" title={<>Understand the machinery <em className="text-signal-ink">before</em> the framework.</>}>
          Every NEXORA lesson walks the same road. Start with the problem, build the mechanism by hand, and only then meet the library that wraps it.
        </SectionHead>

        <div role="tablist" aria-label="Example topics" className="mt-12 flex flex-wrap gap-2">
          {TOPICS.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === t.id} onClick={() => setT(x)}
              className={clsx("rounded-full border px-4 py-1.5 text-sm transition-colors", x.id === t.id ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}>{x.name}</button>
          ))}
        </div>

        <div className="relative mt-8 grid gap-4 md:grid-cols-3" role="tabpanel">
          {cols.map((c, i) => (
            <div key={c.k} className="relative">
              <AnimatePresence mode="wait">
                <motion.div key={t.id + c.k} initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.38, delay: i * 0.06, ease: EASE }}
                  className={clsx("h-full rounded-2xl border p-6", i === 1 ? "border-signal bg-surface" : "border-line bg-surface")}>
                  <div className="flex items-center justify-between"><span className="eyebrow">{`0${i + 1} · ${c.k}`}</span>{i === 1 && <span className="font-mono text-[0.65rem] text-signal-ink">where NEXORA lives</span>}</div>
                  {c.code ? <code className="code mt-5 block rounded-lg p-3 text-[0.82rem] leading-relaxed">{c.v}</code> : <p className="mt-5 text-[1.02rem] leading-relaxed">{c.v}</p>}
                </motion.div>
              </AnimatePresence>
              {i < 2 && <ArrowRight aria-hidden="true" className="absolute -right-[1.05rem] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-bg-2 p-1 text-signal md:block" size={26} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
