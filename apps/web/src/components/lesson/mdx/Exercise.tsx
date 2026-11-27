"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { clsx } from "clsx";
import { answerExercise, lessonStateOf, useProgress } from "@/lib/progress";
import { useLessonCtx } from "../LessonContext";
import type { ExerciseProps } from "@/content/schema";

const KIND = { quiz: "Quiz", predict: "Predict", debug: "Debug", scenario: "Scenario" } as const;

export function Exercise({ id, kind, prompt, options, answer, explain }: ExerciseProps) {
  const ctx = useLessonCtx();
  const progress = useProgress();
  const saved = ctx ? lessonStateOf(progress, ctx.chapter, ctx.slug).exercises[id] : undefined;
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const right = checked && pick === answer;
  const solved = saved?.correct && !checked; // answered correctly in an earlier visit
  const reveal = checked || solved;

  const check = () => {
    if (pick === null) return;
    setChecked(true);
    if (ctx) answerExercise(ctx.chapter, ctx.slug, id, pick === answer, ctx.exerciseIds, ctx.chapterLessons);
  };

  return (
    <section aria-labelledby={`${id}-q`} className="my-8 rounded-2xl border border-line bg-surface p-5 md:p-6">
      <p className="eyebrow flex items-center gap-2">
        {KIND[kind]}
        {(saved?.correct || right) && <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-ok normal-case tracking-normal"><Check size={11} strokeWidth={3} />answered</span>}
      </p>
      <p id={`${id}-q`} className="mt-3 text-[1.02rem] font-medium leading-snug">{prompt}</p>
      <div role="radiogroup" aria-labelledby={`${id}-q`} className="mt-4 grid gap-2">
        {options.map((o, i) => {
          const isAns = i === answer, isPick = pick === i;
          return (
            <button key={i} type="button" role="radio" aria-checked={isPick} disabled={checked && right} onClick={() => { if (!right) { setPick(i); setChecked(false); } }}
              className={clsx("flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-[0.95rem] leading-snug transition-colors",
                reveal && isAns && (checked || solved) ? "border-ok bg-ok/10" : checked && isPick && !isAns ? "border-warn bg-warn/10" : isPick ? "border-ink bg-bg-2" : "border-line hover:border-line-strong")}>
              <span className={clsx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[0.65rem]", isPick ? "border-ink bg-ink text-bg" : "border-line-strong")}>{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{o}</span>
              {checked && isPick && (isAns ? <Check size={16} className="mt-0.5 text-ok" /> : <X size={16} className="mt-0.5 text-warn" />)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={check} disabled={pick === null || right} className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-bg transition enabled:hover:bg-signal enabled:hover:text-white disabled:opacity-40">Check answer</button>
        <p role="status" aria-live="polite" className="text-sm">
          {checked && (right ? <span className="text-ok">Correct.</span> : <span className="text-warn">Not quite. Pick another option and check again.</span>)}
        </p>
      </div>
      {(right || solved) && <p className="mt-4 border-t border-line pt-4 text-[0.95rem] leading-relaxed text-ink-2"><span className="font-medium text-ink">Why: </span>{explain}</p>}
    </section>
  );
}
