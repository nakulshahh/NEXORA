/**
 * Content pipeline: `node scripts/content.ts check|build`
 *  check  validates every lesson (exit 1 on any error) — this is what CI runs.
 *  build  = check, then writes src/data/lessons.generated.json and search.generated.json.
 * Runs on plain Node (type stripping), so only relative imports with explicit .ts extensions.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkGfm from "remark-gfm";
import { PARTS } from "../src/data/curriculum.ts";
import { CALLOUT_KINDS, ExerciseProps, Frontmatter, REQUIRED_SECTIONS, SIM_IDS, type LessonIndexEntry, type SearchEntry } from "../src/content/schema.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(here, "..");
const LESSONS_DIR = process.env.NEXORA_LESSONS_DIR ?? resolve(WEB, "../../packages/content/lessons");
const OUT = join(WEB, "src/data");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;
const errors: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

function text(n: Node): string {
  if (n.type === "text" || n.type === "inlineCode") return n.value;
  return (n.children ?? []).map(text).join("");
}
function walk(n: Node, f: (n: Node) => void) { f(n); for (const c of n.children ?? []) walk(c, f); }

/** JSX attribute -> JS value. Expression attributes must be JSON (documented authoring rule). */
function attr(el: Node, name: string, where: string): unknown {
  const a = (el.attributes ?? []).find((x: Node) => x.type === "mdxJsxAttribute" && x.name === name);
  if (!a) return undefined;
  if (typeof a.value === "string" || a.value == null) return a.value;
  try { return JSON.parse(a.value.value); } catch { err(where, `<${el.name} ${name}={…}> must be valid JSON (double quotes, no trailing commas)`); return undefined; }
}

// ───────────────────────── curriculum graph ─────────────────────────
const chapters = new Map(PARTS.flatMap((p) => p.chapters.map((c) => [c.id, { ...c, part: p.slug }] as const)));
function checkGraph() {
  for (const c of chapters.values()) for (const r of c.prereqs) if (!chapters.has(r)) err(`curriculum ${c.id}`, `unknown prerequisite "${r}"`);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { err("curriculum", `prerequisite cycle: ${[...path, id].join(" → ")}`); return; }
    state.set(id, 1);
    for (const r of chapters.get(id)?.prereqs ?? []) visit(r, [...path, id]);
    state.set(id, 2);
  };
  for (const id of chapters.keys()) visit(id, []);
}

// ───────────────────────── lessons ─────────────────────────
interface CardEntry { chapter: string; lesson: string; lessonTitle: string; id: string; kind: string; prompt: string; options: string[]; answer: number; explain: string }
interface Parsed { index: LessonIndexEntry; search: SearchEntry; cards: CardEntry[]; concepts: string[]; links: { where: string; url: string }[] }

function parseLesson(file: string, rel: string): Parsed | null {
  const raw = readFileSync(file, "utf8");
  let fm: matter.GrayMatterFile<string>;
  try { fm = matter(raw); } catch (e) { err(rel, `frontmatter YAML error: ${(e as Error).message.split("\n")[0]}`); return null; }
  const f = Frontmatter.safeParse(fm.data);
  if (!f.success) { for (const i of f.error.issues) err(rel, `frontmatter ${i.path.join(".") || "(root)"}: ${i.message}`); return null; }
  const d = f.data;

  const ch = chapters.get(d.chapter);
  if (!ch) { err(rel, `chapter "${d.chapter}" is not in the curriculum`); return null; }
  const m = rel.match(/^([^/]+)\/(\d\d)-(.+)\.mdx$/);
  if (!m || m[1] !== d.chapter.toLowerCase() || Number(m[2]) !== d.order || m[3] !== d.slug) err(rel, `file path must be ${d.chapter.toLowerCase()}/${String(d.order).padStart(2, "0")}-${d.slug}.mdx`);

  let tree: Node;
  try { tree = parser.parse(fm.content); } catch (e) { err(rel, `MDX syntax error: ${(e as Error).message}`); return null; }

  const slugger = new GithubSlugger();
  const headings: { id: string; text: string }[] = [];
  const sections: SearchEntry["sections"] = [{ id: "top", heading: d.title, text: "" }];
  const exercises: string[] = [];
  const cards: CardEntry[] = [];
  const links: Parsed["links"] = [];
  let words = 0, h1 = 0;

  walk(tree, (n) => {
    if (n.type === "heading") {
      const t = text(n);
      if (n.depth === 1) h1++;
      if (n.depth === 2 || n.depth === 3) {
        const id = slugger.slug(t);
        if (n.depth === 2) { headings.push({ id, text: t }); sections.push({ id, heading: t, text: "" }); }
      }
    } else if (n.type === "code") {
      if (!n.lang) err(rel, `code fence at line ${n.position?.start.line} has no language`);
    } else if (n.type === "link") {
      links.push({ where: `${rel}:${n.position?.start.line}`, url: n.url });
    } else if (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") {
      const where = `${rel}:${n.position?.start.line}`;
      if (n.name === "Exercise") {
        const props = ExerciseProps.safeParse({ id: attr(n, "id", where), kind: attr(n, "kind", where), prompt: attr(n, "prompt", where), options: attr(n, "options", where), answer: attr(n, "answer", where), explain: attr(n, "explain", where) });
        if (!props.success) for (const i of props.error.issues) err(where, `<Exercise> ${i.path.join(".")}: ${i.message}`);
        else { if (exercises.includes(props.data.id)) err(where, `duplicate exercise id "${props.data.id}"`); exercises.push(props.data.id); cards.push({ chapter: d.chapter, lesson: d.slug, lessonTitle: d.title, id: props.data.id, kind: props.data.kind, prompt: props.data.prompt, options: props.data.options, answer: props.data.answer, explain: props.data.explain }); }
      } else if (n.name === "Sim") {
        const id = attr(n, "id", where) as string;
        if (!(SIM_IDS as readonly string[]).includes(id)) err(where, `<Sim id="${id}"> is not one of ${SIM_IDS.join(", ")}`);
      } else if (n.name === "Callout") {
        const k = attr(n, "kind", where) as string;
        if (!(CALLOUT_KINDS as readonly string[]).includes(k)) err(where, `<Callout kind="${k}"> must be one of ${CALLOUT_KINDS.join(", ")}`);
      } else if (n.name === "Seq") {
        const ps = attr(n, "participants", where) as string[] | undefined; const ms = attr(n, "messages", where) as { from: number; to: number; label: string }[] | undefined;
        if (!ps || !ms) err(where, "<Seq> needs participants and messages");
        else for (const x of ms) if (!(x.from >= 0 && x.from < ps.length && x.to >= 0 && x.to < ps.length)) err(where, `<Seq> message "${x.label}" references a participant index out of range`);
      } else if (n.name) {
        err(where, `unknown component <${n.name}>`);
      }
    }
  });
  if (h1) err(rel, "do not use H1 in the body; the title comes from frontmatter");

  // Section text for search + word count (prose only, code excluded).
  let cur = sections[0]!;
  for (const n of tree.children as Node[]) {
    if (n.type === "heading" && n.depth === 2) { cur = sections.find((s) => s.heading === text(n))!; continue; }
    if (n.type === "code") continue;
    const t = text(n).trim();
    if (t) { cur.text += (cur.text ? " " : "") + t; words += t.split(/\s+/).length; }
  }

  const have = headings.map((h) => h.text);
  const missing = REQUIRED_SECTIONS.filter((s) => !have.includes(s));
  if (missing.length) err(rel, `missing required section(s): ${missing.join(", ")}`);
  else { const order = have.filter((h) => (REQUIRED_SECTIONS as readonly string[]).includes(h)); if (order.join("|") !== REQUIRED_SECTIONS.join("|")) err(rel, `required sections must appear in order: ${REQUIRED_SECTIONS.join(" → ")}`); }
  if (exercises.length < 3) err(rel, `needs at least 3 exercises (found ${exercises.length})`);
  const kinds = new Set<string>(); walk(tree, (n) => { if (n.name === "Exercise") kinds.add(String(attr(n, "kind", rel))); });
  if (kinds.size < 2) err(rel, "exercises must use at least 2 different kinds (quiz, predict, debug, scenario)");

  const minutes = Math.max(3, Math.ceil(words / 200 + exercises.length * 0.75));
  return {
    index: { chapter: d.chapter, slug: d.slug, title: d.title, order: d.order, summary: d.summary, minutes, objectives: d.objectives, exercises, headings },
    search: { chapter: d.chapter, slug: d.slug, title: d.title, sections: sections.filter((s) => s.text) },
    cards, concepts: d.concepts,
    links,
  };
}

function main() {
  const cmd = process.argv[2] ?? "check";
  checkGraph();
  const lessons: Parsed[] = [];
  if (existsSync(LESSONS_DIR)) {
    for (const dir of readdirSync(LESSONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of readdirSync(join(LESSONS_DIR, dir.name)).filter((x) => x.endsWith(".mdx")).sort()) {
        const p = parseLesson(join(LESSONS_DIR, dir.name, f), `${dir.name}/${f}`);
        if (p) lessons.push(p);
      }
    }
  }
  // Uniqueness + contiguous order per chapter.
  const byChapter = new Map<string, Parsed[]>();
  for (const l of lessons) byChapter.set(l.index.chapter, [...(byChapter.get(l.index.chapter) ?? []), l]);
  for (const [ch, ls] of byChapter) {
    const orders = ls.map((l) => l.index.order).sort((a, b) => a - b);
    orders.forEach((o, i) => { if (o !== i + 1) err(`chapter ${ch}`, `lesson orders must be 1..n with no gaps/duplicates (got ${orders.join(",")})`); });
    if (new Set(ls.map((l) => l.index.slug)).size !== ls.length) err(`chapter ${ch}`, "duplicate lesson slug");
  }

  // Internal links must resolve.
  const lessonKeys = new Set(lessons.map((l) => `${l.index.chapter.toLowerCase()}/${l.index.slug}`));
  for (const l of lessons) for (const k of l.links) {
    const m = k.url.match(/^\/learn\/([a-z-]+)\/([a-z0-9.]+)(?:\/([a-z0-9-]+))?(?:#[\w-]+)?$/);
    if (k.url.startsWith("/learn")) {
      if (!m) { err(k.where, `malformed internal link ${k.url}`); continue; }
      const ch = [...chapters.values()].find((c) => c.id.toLowerCase() === m[2] && c.part === m[1]);
      if (!ch) err(k.where, `broken link ${k.url}: no such chapter`);
      else if (m[3] && !lessonKeys.has(`${m[2]}/${m[3]}`)) err(k.where, `broken link ${k.url}: no such lesson`);
    }
  }

  if (errors.length) {
    console.error(`\n✖ content check failed (${errors.length})\n`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`✔ content check passed: ${lessons.length} lesson(s) in ${byChapter.size} chapter(s), ${chapters.size} chapters in graph, no cycles`);

  if (cmd === "build") {
    mkdirSync(OUT, { recursive: true });
    const sorted = lessons.sort((a, b) => a.index.chapter.localeCompare(b.index.chapter) || a.index.order - b.index.order);
    writeFileSync(join(OUT, "lessons.generated.json"), JSON.stringify(sorted.map((l) => l.index), null, 1));
    writeFileSync(join(OUT, "search.generated.json"), JSON.stringify(sorted.map((l) => l.search)));
    // Revision cards = the lessons' exercises, plus each lesson's concepts for the "where you struggle" view.
    writeFileSync(join(OUT, "cards.generated.json"), JSON.stringify({ cards: sorted.flatMap((l) => l.cards), concepts: Object.fromEntries(sorted.map((l) => [`${l.index.chapter}/${l.index.slug}`, l.concepts])) }));
    console.log("✔ wrote src/data/lessons.generated.json, search.generated.json, cards.generated.json");
  }
}
main();
