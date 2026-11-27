import { createHighlighter, type Highlighter } from "shiki";
import { clsx } from "clsx";
import { CopyButton } from "./CopyButton";

const LANGS = ["js", "ts", "json", "bash", "http", "text"] as const;
let hl: Promise<Highlighter> | null = null;
const highlighter = () => (hl ??= createHighlighter({ themes: ["github-dark"], langs: [...LANGS] }));

/** Server component: Shiki runs at build time, so the client receives coloured spans and no highlighter. */
export async function CodeBlock({ code, lang = "text", file, mark = "" }: { code: string; lang?: string; file?: string; mark?: string }) {
  const marked = new Set(mark.split(",").map(Number).filter(Number.isFinite));
  const h = await highlighter();
  const safe = (LANGS as readonly string[]).includes(lang) ? lang : "text";
  const { tokens } = h.codeToTokens(code.replace(/\n$/, ""), { lang: safe as (typeof LANGS)[number], theme: "github-dark" });
  return (
    <figure className="code my-7 overflow-hidden rounded-xl border border-line-strong text-[0.85rem]">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-mono text-[0.7rem] text-[#8a867b]">
        <span>{file ?? lang}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto py-3 leading-[1.75]" tabIndex={0}>
        <code>
          {tokens.map((line, n) => (
            <span key={n} className={clsx("flex px-4", marked.has(n + 1) && "bg-[#ff6b3d]/15 shadow-[inset_2px_0_0_#ff6b3d]")}>
              <span aria-hidden="true" className="mr-4 w-4 shrink-0 select-none text-right text-[#6a665c]">{n + 1}</span>
              <span className="whitespace-pre">{line.length ? line.map((t, i) => <span key={i} style={{ color: t.color }}>{t.content}</span>) : " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
