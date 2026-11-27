import raw from "./lessons.generated.json";
import type { LessonIndexEntry } from "@/content/schema";

/** Built by `pnpm content:build` from the MDX frontmatter. Never edit the JSON by hand. */
export const LESSONS = raw as LessonIndexEntry[];
export const lessonsOf = (chapter: string) => LESSONS.filter((l) => l.chapter === chapter).sort((a, b) => a.order - b.order);
export const lessonKey = (chapter: string, slug: string) => `${chapter}/${slug}`;
export const hasLessons = (chapter: string) => LESSONS.some((l) => l.chapter === chapter);
export const lessonHref = (partSlug: string, chapter: string, slug: string) => `/learn/${partSlug}/${chapter.toLowerCase()}/${slug}`;
