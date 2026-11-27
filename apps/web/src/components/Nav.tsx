"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/roadmap", label: "Roadmap" },
  { href: "/labs", label: "Labs" },
  { href: "/revise", label: "Revise" },
  { href: "/playground", label: "Playground" },
  { href: "/learn", label: "Dashboard" },
];

export function Nav({ onSearch }: { onSearch?: () => void }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-[2px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">Skip to content</a>
      <nav aria-label="Primary" className="mx-auto flex h-14 max-w-[88rem] items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="NEXORA home" className="text-ink"><Wordmark /></Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = path === l.href || (l.href !== "/learn" && path.startsWith(l.href + "/"));
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? "page" : undefined}
                  className={clsx("relative rounded-full px-4 py-1.5 text-sm transition-colors", active ? "text-ink" : "text-ink-2 hover:text-ink")}>
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-bg-2" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onSearch} aria-label="Search curriculum"
            className="hidden h-9 items-center gap-2 rounded-full border border-line px-3 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink sm:flex">
            <Search size={14} /> <span>Search</span>
            <kbd className="rounded border border-line px-1.5 font-mono text-[0.68rem] text-ink-3">/</kbd>
          </button>
          <ThemeToggle />
          {user
            ? <Link href="/account" className="hidden h-9 items-center rounded-full border border-line px-4 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink sm:inline-flex">Account</Link>
            : <Link href="/auth/sign-in" className="hidden h-9 items-center rounded-full border border-line px-4 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink sm:inline-flex">Sign in</Link>}
          <Link href="/learn" className="hidden h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-bg transition hover:bg-signal hover:text-white sm:inline-flex">Start learning</Link>
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full border border-line md:hidden">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto bg-bg px-5 pb-10 pt-6 md:hidden">
            <ul className="space-y-1">
              {[{ href: "/", label: "Home" }, ...LINKS, user ? { href: "/account", label: "Account" } : { href: "/auth/sign-in", label: "Sign in" }, { href: "/learn", label: "Start learning" }].map((l, i) => (
                <motion.li key={l.label} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                  <Link href={l.href} className="flex items-baseline justify-between border-b border-line py-4 font-display text-4xl">
                    {l.label}<span className="font-mono text-xs text-ink-3">0{i + 1}</span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
