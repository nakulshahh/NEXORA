import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { ALL_CHAPTERS } from "@/data/curriculum";
import { LESSONS, lessonHref, lessonsOf } from "@/data/lessons";
import { readLesson } from "@/lib/content";
import { remarkCode } from "@/lib/remark-code";
import { chapterHref } from "@/lib/routes";
import { LessonShell } from "@/components/lesson/LessonShell";
import { mdxComponents } from "@/components/lesson/mdx";

export const dynamicParams = false;
export function generateStaticParams() {
  return LESSONS.map((l) => ({ part: ALL_CHAPTERS.find((c) => c.id === l.chapter)!.partSlug, chapter: l.chapter.toLowerCase(), lesson: l.slug }));
}

type P = { part: string; chapter: string; lesson: string };
const find = (part: string, chapter: string, lesson: string) => {
  const c = ALL_CHAPTERS.find((x) => x.partSlug === part && x.id.toLowerCase() === chapter);
  const l = c && LESSONS.find((x) => x.chapter === c.id && x.slug === lesson);
  return c && l ? { c, l } : null;
};

export async function generateMetadata({ params }: { params: Promise<P> }): Promise<Metadata> {
  const { part, chapter, lesson } = await params; const f = find(part, chapter, lesson);
  return f ? { title: f.l.title, description: f.l.summary } : { title: "Lesson" };
}

export default async function LessonPage({ params }: { params: Promise<P> }) {
  const { part, chapter, lesson } = await params;
  const f = find(part, chapter, lesson); if (!f) notFound();
  const { c, l } = f;
  const doc = readLesson(c.id, l.slug); if (!doc) notFound();

  const { content } = await compileMDX({
    source: doc.source,
    components: mdxComponents as never,
    // Content is repo-authored and validated in CI, so expression attributes (Seq/Exercise props) are allowed.
    // blockDangerousJS stays on (default): no eval/globals even from trusted files.
    options: { blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm, remarkCode], rehypePlugins: [rehypeSlug] } },
  });

  const sibs = lessonsOf(c.id);
  const i = sibs.findIndex((x) => x.slug === l.slug);
  const link = (x: (typeof sibs)[number]) => lessonHref(c.partSlug, c.id, x.slug);
  const nextChapter = ALL_CHAPTERS[ALL_CHAPTERS.findIndex((x) => x.id === c.id) + 1];

  return (
    <LessonShell
      chapter={{ id: c.id, title: c.title, href: chapterHref(c) }}
      lesson={{ slug: l.slug, title: l.title, order: l.order, summary: l.summary, minutes: l.minutes, objectives: l.objectives, headings: l.headings, exercises: l.exercises }}
      siblings={sibs.map((x) => ({ slug: x.slug, title: x.title, href: link(x), exercises: x.exercises }))}
      prereqs={c.prereqs.map((id) => { const p = ALL_CHAPTERS.find((x) => x.id === id)!; return { id, title: p.title, href: chapterHref(p) }; })}
      prev={i > 0 ? { title: sibs[i - 1]!.title, href: link(sibs[i - 1]!) } : null}
      next={i < sibs.length - 1 ? { title: sibs[i + 1]!.title, href: link(sibs[i + 1]!), chapterEnd: false } : nextChapter ? { title: `${nextChapter.id} ${nextChapter.title}`, href: chapterHref(nextChapter), chapterEnd: true } : null}
      watch={doc.fm.watch} reading={doc.fm.reading} misconceptions={doc.fm.misconceptions}
    >
      {content}
    </LessonShell>
  );
}
