"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import { lessonStateOf, useProgress } from "@/lib/progress";

export function ChapterLessons({ chapter, items }: { chapter: string; items: { slug: string; title: string; summary: string; minutes: number; exercises: string[]; href: string }[] }) {
  const p = useProgress();
  const done = items.filter((i) => lessonStateOf(p, chapter, i.slug).done).length;
  return (
    <>
      <p className="mt-2 font-mono text-xs text-ink-2">{done} of {items.length} complete · {items.reduce((a, b) => a + b.minutes, 0)} min</p>
      <ol className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {items.map((l, k) => {
          const s = lessonStateOf(p, chapter, l.slug);
          const n = l.exercises.filter((id) => s.exercises[id]?.correct).length;
          return (
            <li key={l.slug}>
              <Link href={l.href} className="group flex items-start gap-4 p-5 transition-colors hover:bg-bg-2">
                <span className={clsx("mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs", s.done ? "border-ok bg-ok text-white" : "border-line-strong")}>{s.done ? <Check size={14} strokeWidth={3} /> : k + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-2xl leading-tight group-hover:text-signal-ink">{l.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-2">{l.summary}</span>
                  <span className="mt-2 block font-mono text-xs text-ink-3">{l.minutes} min · {n}/{l.exercises.length} exercises{s.done ? " · complete" : s.scroll > 0 ? ` · read ${Math.round(s.scroll * 100)}%` : ""}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
