"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Search } from "lucide-react";
import { clsx } from "clsx";
import { ALL_CHAPTERS } from "@/data/curriculum";
import { chapterHref } from "@/lib/routes";
import { lessonHref } from "@/data/lessons";
import type { SearchEntry } from "@/content/schema";

export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Lesson text is loaded on first open, not shipped with every page.
  const [index, setIndex] = useState<SearchEntry[]>([]);
  useEffect(() => { if (open && !index.length) import("@/data/search.generated.json").then((m) => setIndex(m.default as SearchEntry[])).catch(() => {}); }, [open, index.length]);

  type Hit = { id: string; label: string; sub: string; href: string; tag: string };
  const results = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    const chapters = (t ? ALL_CHAPTERS.filter((c) => `${c.id} ${c.title} ${c.summary} ${c.sim ?? ""} ${c.partTitle}`.toLowerCase().includes(t)) : ALL_CHAPTERS.filter((c) => c.slice))
      .map((c) => ({ id: `ch-${c.id}`, label: c.title, sub: c.partTitle + (c.sim ? ` · ${c.sim}` : ""), href: chapterHref(c), tag: c.id }));
    if (!t) return chapters.slice(0, 8);
    const lessons: Hit[] = [];
    for (const l of index) {
      const ch = ALL_CHAPTERS.find((c) => c.id === l.chapter); if (!ch) continue;
      for (const s of l.sections) {
        const hay = `${s.heading} ${s.text}`.toLowerCase(); const at = hay.indexOf(t);
        if (at < 0 && !`${l.title}`.toLowerCase().includes(t)) continue;
        const body = s.text; const bi = body.toLowerCase().indexOf(t);
        const snip = bi >= 0 ? (bi > 40 ? "…" : "") + body.slice(Math.max(0, bi - 40), bi + 80).trim() + "…" : l.title;
        lessons.push({ id: `ls-${l.chapter}-${l.slug}-${s.id}`, label: `${l.title} › ${s.heading}`, sub: snip, href: `${lessonHref(ch.partSlug, l.chapter, l.slug)}#${s.id}`, tag: l.chapter });
      }
    }
    return [...chapters.slice(0, 4), ...lessons.slice(0, 6)];
  }, [q, index]);

  useEffect(() => { if (open) { setQ(""); setI(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  useEffect(() => setI(0), [q]);

  const go = (idx: number) => { const c = results[idx]; if (c) { onClose(); router.push(c.href); } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-start justify-items-center bg-ink/40 px-4 pt-[14vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div role="dialog" aria-modal="true" aria-label="Search curriculum"
            initial={{ y: -12, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter") go(i);
            }}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={16} className="text-ink-3" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chapters and lessons…" aria-label="Search"
                role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={results[i] ? `cmd-${results[i]!.id}` : undefined}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-ink-3" />
              <kbd className="rounded border border-line px-1.5 font-mono text-[0.68rem] text-ink-3">esc</kbd>
            </div>
            <ul id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {!q && <li className="eyebrow px-3 pb-1 pt-2">v1 slice</li>}
              {results.map((c, idx) => (
                <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={idx === i}
                  onMouseEnter={() => setI(idx)} onClick={() => go(idx)}
                  className={clsx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5", idx === i ? "bg-bg-2" : "")}>
                  <span className="w-9 font-mono text-xs text-signal-ink">{c.tag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.label}</span>
                    <span className="block truncate text-xs text-ink-2">{c.sub}</span>
                  </span>
                  {idx === i && <CornerDownLeft size={14} className="text-ink-3" />}
                </li>
              ))}
              {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-2">Nothing matches “{q}”.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
