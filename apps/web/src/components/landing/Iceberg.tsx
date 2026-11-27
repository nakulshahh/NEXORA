"use client";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { SectionHead } from "../motion";

const LAYERS = [
  { tag: "What tutorials show", code: 'app.get("/users/:id", handler)', body: "One line. It works. You ship it." },
  { tag: "The router & middleware", code: "stack.push(layer); next(err)", body: "A list of functions, a loop, and an error path nobody told you about." },
  { tag: "node:http", code: "parse(\"GET /users/42 HTTP/1.1\\r\\n…\")", body: "Text on a wire, parsed byte by byte into a request object." },
  { tag: "A TCP socket", code: "socket.on('data', chunk => …)", body: "A stream with no message boundaries. Framing is your problem." },
  { tag: "The kernel", code: "epoll_wait(fd, events, …)", body: "File descriptors, buffers and one thread waiting on thousands of sockets." },
  { tag: "The network", code: "SYN → SYN-ACK → ACK", body: "Packets that get lost, reordered and retried before your handler ever runs." },
];

function Layer({ i, p, reduce }: { i: number; p: MotionValue<number>; reduce: boolean }) {
  const a = 0.08 + i * 0.13;
  const opacity = useTransform(p, [a, a + 0.1], [0.14, 1]);
  const x = useTransform(p, [a, a + 0.1], [-16, 0]);
  const L = LAYERS[i]!;
  return (
    <motion.li style={reduce ? undefined : { opacity, x }} className="grid grid-cols-[2.2rem_1fr] gap-4 border-t border-line py-5 first:border-t-0 md:grid-cols-[3rem_1fr_1.1fr]">
      <span className="font-mono text-xs text-signal-ink">{String(i).padStart(2, "0")}</span>
      <div className="min-w-0"><div className="eyebrow">{L.tag}</div><code className="mt-1.5 block truncate font-mono text-[0.95rem] text-ink">{L.code}</code></div>
      <p className="col-start-2 text-sm leading-relaxed text-ink-2 md:col-start-auto">{L.body}</p>
    </motion.li>
  );
}

export function Iceberg() {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const depth = useTransform(scrollYProgress, [0.05, 0.9], ["0%", "100%"]);
  const dn = useTransform(scrollYProgress, [0.05, 0.9], [0, 5]);
  return (
    <section ref={ref} id="problem" data-hop="01" className={reduce ? "py-28" : "relative h-[300vh]"}>
      <div className={reduce ? "" : "sticky top-14 flex min-h-[calc(100vh-3.5rem)] items-center py-10"}>
        <div className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 md:px-8 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
          <div>
            <SectionHead index="01" eyebrow="The problem" title={<>You learned the top line. <em className="text-signal-ink">Production lives underneath.</em></>}>
              Frameworks hide six layers of machinery. When something breaks at 3 a.m., the hidden layers are the only ones that matter.
            </SectionHead>
            <div className="mt-10 hidden items-center gap-4 lg:flex" aria-hidden="true">
              <div className="relative h-1 w-48 overflow-hidden rounded bg-line"><motion.div className="absolute inset-y-0 left-0 bg-signal" style={{ width: reduce ? "100%" : depth }} /></div>
              <span className="font-mono text-xs text-ink-2">depth <motion.span>{useTransform(dn, (v) => Math.round(v).toString())}</motion.span> / 5</span>
            </div>
          </div>
          <ol className="rounded-2xl border border-line bg-surface px-5 md:px-7">
            {LAYERS.map((_, i) => <Layer key={i} i={i} p={scrollYProgress} reduce={reduce} />)}
          </ol>
        </div>
      </div>
    </section>
  );
}
