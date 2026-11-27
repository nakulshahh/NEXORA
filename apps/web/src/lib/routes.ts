import type { Chapter } from "@/data/curriculum";
import { PARTS } from "@/data/curriculum";

export function partSlugOf(chapterId: string): string {
  return PARTS.find((p) => p.chapters.some((c) => c.id === chapterId))!.slug;
}
export const chapterHref = (c: Pick<Chapter, "id">) => `/learn/${partSlugOf(c.id)}/${c.id.toLowerCase()}`;
