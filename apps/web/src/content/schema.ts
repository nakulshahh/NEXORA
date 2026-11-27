import { z } from "zod";

/** H2 headings every lesson must contain, in this order. Mirrors BLUEPRINT §2 "Chapter / lesson template". */
export const REQUIRED_SECTIONS = ["Why it exists", "How it works", "Common mistakes", "Trade-offs", "In production", "Check yourself"] as const;
export const SIM_IDS = ["http", "dns", "event-loop", "router", "bytes", "auth", "btree", "cache"] as const;
export const EXERCISE_KINDS = ["quiz", "predict", "debug", "scenario"] as const;
export const CALLOUT_KINDS = ["why", "mistake", "tradeoff", "prod", "note"] as const;
export const DIAGRAM_COMPONENTS = ["Seq", "Sim"] as const;

const link = z.object({ title: z.string().min(3), url: z.url() });

export const Frontmatter = z.strictObject({
  chapter: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case"),
  title: z.string().min(5).max(90),
  order: z.number().int().min(1),
  summary: z.string().min(30).max(240),
  objectives: z.array(z.string().min(12)).min(2).max(5),
  concepts: z.array(z.string().min(2)).min(1),
  /** Supplementary videos. Link + attribution only; never transcripts. */
  watch: z.array(link.extend({ channel: z.string().min(2) })).default([]),
  reading: z.array(link).default([]),
  /** Authored misconceptions: the AI Professor (M6) classifies against these, never against free-form guesses. */
  misconceptions: z.array(z.strictObject({ belief: z.string().min(12), correction: z.string().min(20) })).min(1),
});
export type Frontmatter = z.infer<typeof Frontmatter>;

export const ExerciseProps = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(EXERCISE_KINDS),
  prompt: z.string().min(10),
  options: z.array(z.string().min(1)).min(2).max(5),
  answer: z.number().int().min(0),
  explain: z.string().min(20),
}).refine((e) => e.answer < e.options.length, { message: "answer index out of range", path: ["answer"] });
export type ExerciseProps = z.infer<typeof ExerciseProps>;

export interface LessonIndexEntry {
  chapter: string;
  slug: string;
  title: string;
  order: number;
  summary: string;
  minutes: number;
  objectives: string[];
  exercises: string[];
  headings: { id: string; text: string }[];
}
export interface SearchEntry { chapter: string; slug: string; title: string; sections: { id: string; heading: string; text: string }[] }
