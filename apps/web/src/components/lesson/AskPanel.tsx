"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { ApiError, api, useAuth } from "@/lib/auth";
import { lessonHref } from "@/data/lessons";
import { partSlugOf } from "@/lib/routes";

interface Citation { n: number; title: string; chapter: string | null; lesson_slug: string | null; section: string; anchor: string; url: string | null; doc_kind: string; snippet: string }
interface Line { text: string; cite: number }
interface Answer {
  status: "answered" | "insufficient_evidence";
  lines: Line[]; misconception: Line | null; citations: Citation[]; message: string | null; suggestions: string[];
  mode: { retrieval: string; embedder: string; generator: string };
}
type View = { k: "idle" } | { k: "loading"; q: string } | { k: "done"; q: string; a: Answer } | { k: "error"; q: string; msg: string };

const MODE_NOTE: Record<string, string> = {
  hybrid: "keyword + semantic search", lexical: "keyword search only", vector: "semantic search only",
};

function hrefOf(c: Citation): string | null {
  if (c.doc_kind === "lesson" && c.chapter && c.lesson_slug) return `${lessonHref(partSlugOf(c.chapter), c.chapter, c.lesson_slug)}${c.anchor ? `#${c.anchor}` : ""}`;
  return c.url;
}

export function AskPanel({ quote, chapter, lesson }: { quote: string | null; chapter: string; lesson: string }) {
  const auth = useAuth();
  const [text, setText] = useState("");
  const [view, setView] = useState<View>({ k: "idle" });
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (quote) { setText(`Explain this: “${quote.slice(0, 200)}”`); input.current?.focus(); } }, [quote]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (q.length < 3 || view.k === "loading") return;
    setView({ k: "loading", q });
    try {
      const a = await api<Answer>("/api/ai/ask", { method: "POST", body: { question: q, context: { chapter, lesson } } });
      setView({ k: "done", q, a });
    } catch (err) {
      const e2 = err as ApiError;
      setView({ k: "error", q, msg: e2.status === 401 ? "Sign in to ask the Professor." : e2.status === 429 ? e2.message : e2.status === 0 ? "Could not reach the server." : e2.message });
    }
  }

  if (auth.status === "anonymous") {
    return (<><p className="font-medium">AI Professor</p>
      <p className="mt-2 text-ink-2">The Professor answers from these lessons and cites where. It needs an account, which also saves your progress.</p>
      <Link href="/auth/sign-in" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 font-medium text-bg hover:bg-signal hover:text-white">Sign in<ArrowRight size={14} /></Link></>);
  }

  return (<>
    <p className="font-medium">AI Professor</p>
    <p className="mt-1 text-xs text-ink-3">Answers are sentences taken from the lessons, not generated text. If the lessons don’t cover a question, it says so.</p>
    <form onSubmit={submit} className="mt-3">
      <label htmlFor="ask-q" className="sr-only">Your question</label>
      <textarea id="ask-q" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3}
        placeholder="Ask about this lesson, or any lesson…" className="w-full resize-none rounded-xl border border-line-strong bg-bg p-3 text-ink outline-none focus:border-signal" />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-ink-3">{text.length}/500</span>
        <button type="submit" disabled={text.trim().length < 3 || view.k === "loading"} className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-40">
          {view.k === "loading" ? <><Loader2 size={14} className="animate-spin" />Searching</> : <>Ask<ArrowRight size={13} /></>}
        </button>
      </div>
    </form>

    <div aria-live="polite" className="mt-4">
      {view.k === "error" && <p role="alert" className="rounded-lg border border-line-strong p-3 text-ink-2">{view.msg}</p>}
      {view.k === "done" && view.a.status === "insufficient_evidence" && (
        <div className="rounded-lg border border-line-strong p-3">
          <p className="font-medium">Not covered yet</p>
          <p className="mt-1 text-ink-2">{view.a.message}</p>
          {view.a.suggestions.length > 0 && <p className="mt-2 text-ink-2">Closest lessons: {view.a.suggestions.join(", ")}.</p>}
        </div>)}
      {view.k === "done" && view.a.status === "answered" && <AnswerView a={view.a} />}
    </div>
  </>);
}

function AnswerView({ a }: { a: Answer }) {
  const cite = (n: number) => <sup key={n} className="ml-0.5 font-mono text-[10px] text-signal">[{n}]</sup>;
  return (<>
    <div className="space-y-2 text-ink">{a.lines.map((l, i) => <p key={i}>{l.text}{cite(l.cite)}</p>)}</div>
    {a.misconception && <div className="mt-3 border-l-2 border-signal pl-3 text-ink-2"><span className="eyebrow">Common misconception</span><p className="mt-1">{a.misconception.text}{cite(a.misconception.cite)}</p></div>}
    <p className="eyebrow mt-4">Sources</p>
    <ol className="mt-2 space-y-2">{a.citations.map((c) => { const h = hrefOf(c); return (
      <li key={c.n} className="text-ink-2"><span className="font-mono text-[10px] text-signal">[{c.n}]</span>{" "}
        {h ? <Link href={h} className="u-link">{c.title}</Link> : c.title}
        <span className="block text-xs text-ink-3">{c.section}</span></li>); })}</ol>
    <p className="mt-4 text-xs text-ink-3">Extractive answer ({MODE_NOTE[a.mode.retrieval] ?? a.mode.retrieval}). No generative model was used.</p>
  </>);
}
