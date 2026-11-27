import { Callout } from "../Callout";
import { CodeBlock } from "./CodeBlock";
import { Seq } from "./Seq";
import { Sim } from "./Sim";
import { Exercise } from "./Exercise";

const code = "rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[0.9em]";
/** Typography for the reading column. Measure is capped by the container, not here. */
export const mdxComponents = {
  Callout, CodeBlock, Seq, Sim, Exercise,
  h2: (p: React.ComponentProps<"h2">) => <h2 {...p} className="scroll-mt-28 font-display mt-16 text-[2.1rem] leading-tight md:text-[2.5rem]" />,
  h3: (p: React.ComponentProps<"h3">) => <h3 {...p} className="scroll-mt-28 mt-10 text-xl font-semibold leading-snug" />,
  p: (p: React.ComponentProps<"p">) => <p {...p} className="mt-4 text-[1.075rem] leading-[1.8] text-ink/90" />,
  ul: (p: React.ComponentProps<"ul">) => <ul {...p} className="mt-4 list-disc space-y-2 pl-6 text-[1.075rem] leading-[1.75] text-ink/90 marker:text-signal" />,
  ol: (p: React.ComponentProps<"ol">) => <ol {...p} className="mt-4 list-decimal space-y-2 pl-6 text-[1.075rem] leading-[1.75] text-ink/90 marker:font-mono marker:text-ink-3" />,
  a: ({ href = "", ...p }: React.ComponentProps<"a">) => <a href={href} {...p} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} className="u-link" />,
  code: (p: React.ComponentProps<"code">) => <code {...p} className={code} />,
  strong: (p: React.ComponentProps<"strong">) => <strong {...p} className="font-semibold text-ink" />,
  table: (p: React.ComponentProps<"table">) => <div className="my-6 overflow-x-auto rounded-xl border border-line"><table {...p} className="w-full min-w-[32rem] border-collapse text-left text-[0.92rem]" /></div>,
  th: (p: React.ComponentProps<"th">) => <th {...p} className="border-b border-line bg-bg-2 px-4 py-2.5 font-mono text-[0.72rem] font-medium uppercase tracking-wider text-ink-2" />,
  td: (p: React.ComponentProps<"td">) => <td {...p} className="border-b border-line px-4 py-2.5 align-top last:border-0" />,
};
