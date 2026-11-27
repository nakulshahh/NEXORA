import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LABS } from "@/data/curriculum";
import { lessonHref, lessonsOf } from "@/data/lessons";
import { SIM_IDS, SIMS, type SimId } from "@/sim";
import { chapterHref } from "@/lib/routes";
import { ALL_CHAPTERS } from "@/data/curriculum";
import { DnsSim } from "@/components/sim/DnsSim";
import { HttpSim } from "@/components/sim/HttpSim";
import { EventLoopSim } from "@/components/sim/EventLoopSim";
import { AuthSim, BtreeSim, BytesSim, CacheSim, RouterSim } from "@/components/sim/LabSims";

export const dynamicParams = false;
export const generateStaticParams = () => SIM_IDS.map((sim) => ({ sim }));
const VIEW = { http: HttpSim, dns: DnsSim, "event-loop": EventLoopSim, router: RouterSim, bytes: BytesSim, auth: AuthSim, btree: BtreeSim, cache: CacheSim } as const;

export async function generateMetadata({ params }: { params: Promise<{ sim: string }> }): Promise<Metadata> {
  const { sim } = await params; const lab = LABS.find((l) => l.id === sim);
  return lab ? { title: `${lab.title} lab`, description: lab.blurb } : { title: "Lab" };
}

export default async function LabPage({ params }: { params: Promise<{ sim: string }> }) {
  const { sim } = await params;
  if (!(SIM_IDS as string[]).includes(sim)) notFound();
  const id = sim as SimId, lab = LABS.find((l) => l.id === id)!, chapter = ALL_CHAPTERS.find((c) => c.id === lab.chapter)!;
  const Sim = VIEW[id];
  const lessons = lessonsOf(chapter.id);
  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-2"><Link href="/labs" className="u-link">Labs</Link> / <span className="text-ink">{SIMS[id].title}</span></nav>
      <h1 className="font-display mt-5 text-[clamp(2.8rem,6vw,5rem)] leading-[0.98]">{lab.title}</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">{lab.blurb}</p>
      <p className="mt-3 text-sm text-ink-2">Part of <Link href={chapterHref(chapter)} className="u-link">{chapter.id} {chapter.title}</Link>{lessons.length > 0 && <> · Lessons: {lessons.map((l, k) => <span key={l.slug}>{k > 0 && ", "}<Link href={lessonHref(chapter.partSlug, chapter.id, l.slug)} className="u-link">{l.title}</Link></span>)}</>}</p>
      <div className="mt-8"><Sim /></div>
    </div>
  );
}
