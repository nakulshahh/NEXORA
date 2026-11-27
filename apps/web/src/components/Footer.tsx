import Link from "next/link";
import { Wordmark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[88rem] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm text-ink-2">Backend Engineering, Beyond Frameworks. Original lessons, simulations and a grounded AI tutor.</p>
        </div>
        {[
          { h: "Learn", l: [["Roadmap", "/roadmap"], ["Dashboard", "/learn"], ["Labs", "/labs"]] },
          { h: "Method", l: [["First principles", "/#philosophy"], ["Curriculum", "/#curriculum"], ["AI Professor", "/#professor"]] },
          { h: "Status", l: [["Milestone 8 · Hardened", "/"]] },
        ].map((c) => (
          <div key={c.h}>
            <h2 className="eyebrow">{c.h}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {c.l.map(([t, h]) => (<li key={t}><Link href={h!} className="u-link text-ink-2 hover:text-ink">{t}</Link></li>))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[88rem] px-5 py-5 font-mono text-xs text-ink-3 md:px-8">
          © NEXORA · Independent educational project. Video references link to original creators.
        </p>
      </div>
    </footer>
  );
}
