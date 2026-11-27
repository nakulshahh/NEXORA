import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { Frontmatter } from "@/content/schema";

const DIR = join(process.cwd(), "../../packages/content/lessons");

/** Reads one lesson's source. Validation already ran in `content:check`; parse again so types are real, not asserted. */
export function readLesson(chapter: string, slug: string) {
  const dir = join(DIR, chapter.toLowerCase());
  const file = existsSync(dir) ? readdirSync(dir).find((f: string) => f.endsWith(`-${slug}.mdx`)) : undefined;
  if (!file) return null;
  const { data, content } = matter(readFileSync(join(dir, file), "utf8"));
  return { fm: Frontmatter.parse(data), source: content };
}
