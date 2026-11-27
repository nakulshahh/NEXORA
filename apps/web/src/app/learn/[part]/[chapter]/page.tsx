import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { ALL_CHAPTERS, CHAPTER_BY_ID, TIER_LABEL, dependents } from "@/data/curriculum";
import { chapterHref } from "@/lib/routes";
import { lessonHref, lessonsOf } from "@/data/lessons";
import { ChapterLessons } from "@/components/lesson/ChapterLessons";
import { ChapterVisit } from "@/components/lesson/ChapterVisit";

export const dynamicParams = false;
export function generateStaticParams() { return ALL_CHAPTERS.map((c) => ({ part: c.partSlug, chapter: c.id.toLowerCase() })); }

const find = (part: string, chapter: string) => ALL_CHAPTERS.find((c) => c.partSlug === part && c.id.toLowerCase() === chapter);

export async function generateMetadata({ params }: { params: Promise<{ part: string; chapter: string }> }): Promise<Metadata> {
  const { part, chapter } = await params; const c = find(part, chapter);
  return { title: c ? `${c.id} ${c.title}` : "Chapter" };
}

export default async function ChapterPage({ params }: { params: Promise<{ part: string; chapter: string }> }) {
  const { part, chapter } = await params;
  const c = find(part, chapter); if (!c) notFound();
  const i = ALL_CHAPTERS.findIndex((x) => x.id === c.id);
  const prev = ALL_CHAPTERS[i - 1], next = ALL_CHAPTERS[i + 1];
  const lessons = lessonsOf(c.id);
  const Chip = ({ id }: { id: string }) => <Link href={chapterHref({ id })} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink"><span className="font-mono text-xs text-signal-ink">{id}</span>{CHAPTER_BY_ID.get(id)!.title}</Link>;
  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-12 md:px-8 md:pt-20">
      <ChapterVisit id={c.id} />
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-2"><Link href="/roadmap" className="u-link">Roadmap</Link> / <span>{c.partTitle}</span> / <span className="text-ink">{c.id}</span></nav>
      <h1 className="font-display mt-6 text-[clamp(3rem,7vw,6rem)] leading-[0.96]">{c.title}</h1>
      <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink-2">{c.summary}</p>
      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono"><i className={`h-1.5 w-1.5 rounded-full ${c.tier === 1 ? "bg-signal" : c.tier === 2 ? "bg-trace" : "bg-line-strong"}`} />{TIER_LABEL[c.tier]}</span>
        {c.slice && <span className="rounded-full bg-signal-wash px-3 py-1 font-mono text-signal-ink">first slice</span>}
        {c.sim && <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1"><FlaskConical size={12} />{c.sim}</span>}
      </div>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        <section><h2 className="eyebrow">Before this</h2><div className="mt-3 flex flex-wrap gap-2">{c.prereqs.length ? c.prereqs.map((id) => <Chip key={id} id={id} />) : <p className="text-sm text-ink-2">Nothing. You can start here.</p>}</div></section>
        <section><h2 className="eyebrow">Unlocks</h2><div className="mt-3 flex flex-wrap gap-2">{dependents(c.id).length ? dependents(c.id).map((id) => <Chip key={id} id={id} />) : <p className="text-sm text-ink-2">Nothing depends on this yet.</p>}</div></section>
      </div>

      <section className="mt-14" aria-labelledby="lessons-h">
        <h2 id="lessons-h" className="eyebrow">Lessons</h2>
        {lessons.length ? (
          <ChapterLessons chapter={c.id} items={lessons.map((l) => ({ slug: l.slug, title: l.title, summary: l.summary, minutes: l.minutes, exercises: l.exercises, href: lessonHref(c.partSlug, c.id, l.slug) }))} />
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-line-strong p-7"><p className="max-w-xl text-ink-2">{c.slice ? "This chapter is part of the first slice but its lessons are not authored yet." : "This chapter is outlined only. Lessons ship in later milestones, in tier order."} Nothing here stands in for content that already exists.</p></div>
        )}
      </section>

      <div className="mt-14 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
        {prev ? <Link href={chapterHref(prev)} className="rounded-xl border border-line p-4 hover:border-ink"><span className="eyebrow">Previous</span><p className="mt-1 font-display text-2xl">{prev.title}</p></Link> : <span />}
        {next && <Link href={chapterHref(next)} className="rounded-xl border border-line p-4 text-right hover:border-ink"><span className="eyebrow">Next</span><p className="mt-1 font-display text-2xl">{next.title}</p></Link>}
      </div>
    </div>
  );
}
