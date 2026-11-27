import { rng, type ParamDef, type Params, type SimSpec, type Step } from "./engine.ts";
import type { Cell, GenericState, Tone } from "./generic.ts";

const ROWS_PER_PAGE = 100, BUCKETS = 24;
const params: ParamDef[] = [
  { key: "rows", label: "Rows in the table", kind: "select", options: [{ value: "1000", label: "1 thousand" }, { value: "100000", label: "100 thousand" }, { value: "1000000", label: "1 million" }] },
  { key: "fanout", label: "Keys per index page", kind: "select", options: [{ value: "50", label: "50 (wide keys)" }, { value: "200", label: "200" }, { value: "500", label: "500 (narrow keys)" }], hint: "Smaller keys fit more per page, so the tree is shallower." },
  { key: "mode", label: "How the query runs", kind: "select", options: [{ value: "scan", label: "Sequential scan" }, { value: "index", label: "B-tree index" }] },
];
const defaults: Params = { rows: "100000", fanout: "200", mode: "scan" };

/** Pages a full scan reads, and levels a B-tree descent crosses (each page holds FANOUT keys). */
export const scanPages = (rows: number) => Math.ceil(rows / ROWS_PER_PAGE);
export const treeLevels = (rows: number, fanout = 200) => Math.max(1, Math.ceil(Math.log(Math.max(rows, 2)) / Math.log(fanout)));

export function btreeScenario(p: Params, seed: number): Step<GenericState>[] {
  const rows = Number(p.rows), FANOUT = Number(p.fanout), pages = scanPages(rows), levels = treeLevels(rows, FANOUT), r = rng(seed);
  const target = Math.floor(r() * pages), out: Step<GenericState>[] = [];
  const metricsFor = (read: number) => [
    { label: "Pages read", value: String(read) },
    { label: "Full scan would read", value: String(pages) },
    { label: "Index would read", value: String(levels + 1) },
  ];
  if (p.mode === "scan") {
    const chunks = Math.min(BUCKETS, pages), per = pages / chunks, tChunk = Math.min(chunks - 1, Math.floor(target / per));
    const cellsAt = (upto: number, found: boolean): Cell[] => Array.from({ length: chunks }, (_, i) => ({ label: `${Math.floor(i * per)}+`, tone: found && i === tChunk ? "hit" : i <= upto ? "visit" : "idle" }));
    out.push({ id: "start", label: "Plan: sequential scan", explain: "With no usable index the database must read the table from the first page, checking every row against the condition.", ms: 0.1, state: { title: "Table pages (grouped)", cells: cellsAt(-1, false), metrics: metricsFor(0), line: `Seq Scan on t (rows=${rows}, pages=${pages})` } });
    for (let i = 0; i < chunks; i++) {
      const read = Math.min(pages, Math.round((i + 1) * per));
      out.push({ id: `s${i}`, label: `Scan pages ${Math.floor(i * per)}-${read - 1}`, explain: i === tChunk ? `The matching row is in this group (page ${target}), but a scan cannot know it is the only match, so it keeps reading.` : `Read and check every row in these pages. ${read} of ${pages} pages read so far.`, ms: round(per * 0.01), state: { title: "Table pages (grouped)", cells: cellsAt(i, i >= tChunk), metrics: metricsFor(read), line: `read ${read}/${pages} pages` } });
    }
    out.push({ id: "done", label: "Scan finished", explain: `All ${pages} pages were read to return one row. Cost grows linearly with the table: 10x the rows, 10x the pages.`, ms: 0.1, state: { title: "Table pages (grouped)", cells: cellsAt(chunks, true), metrics: metricsFor(pages), line: `done: ${pages} pages for 1 row` } });
    return out;
  }
  const names = ["root", ...Array.from({ length: Math.max(0, levels - 1) }, (_, i) => (i === levels - 2 ? "leaf" : `level ${i + 1}`)), "heap page"];
  const at = (n: number, last: Tone = "hit"): Cell[] => names.map((label, i) => ({ label, sub: i < names.length - 1 ? `fanout ${FANOUT}` : `page ${target}`, tone: i < n ? "visit" : i === n ? last : "idle" }));
  out.push({ id: "start", label: "Plan: index lookup", explain: `A B-tree stores sorted keys, ${FANOUT} per page. Each page read rules out all but 1/${FANOUT} of what remains.`, ms: 0.1, state: { title: "Pages on the path", cells: at(-1), metrics: metricsFor(0), line: `Index Scan using t_id_idx (levels=${levels})` } });
  names.forEach((n, i) => out.push({ id: `p${i}`, label: i === names.length - 1 ? "Fetch the row's page" : `Read ${n} page`, explain: i === names.length - 1 ? `The index entry points to the table page holding the row (page ${target}). One more read, then the row is returned.` : `Choose the child whose key range contains the search key. ${i + 1} page${i ? "s" : ""} read so far.`, ms: 0.05, state: { title: "Pages on the path", cells: at(i), metrics: metricsFor(i + 1), line: `read ${n}` } }));
  out.push({ id: "done", label: "Row found", explain: `Found with ${levels + 1} page reads instead of ${pages}. Doubling the table adds a level only once in a long while: the cost is logarithmic.`, ms: 0.1, state: { title: "Pages on the path", cells: at(names.length, "visit").map((c) => ({ ...c, tone: "hit" as const })), metrics: metricsFor(levels + 1), line: `done: ${levels + 1} pages for 1 row` } });
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100;
export const BTREE_SPEC: SimSpec<GenericState> = {
  id: "btree", title: "Scan vs B-tree", params, defaults, scenario: btreeScenario,
  simplifies: [`Every table page holds exactly ${ROWS_PER_PAGE} rows and every index page exactly the chosen number of keys; real pages vary with row and key size.`, "The condition matches exactly one row and there is no unique constraint, so a scan cannot stop early.", "Everything is read from disk; real systems serve many pages from memory, which narrows the gap but not the shape.", "Time per page is a made-up constant; only the page counts are the point."],
};
