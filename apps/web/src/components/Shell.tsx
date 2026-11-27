"use client";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { CommandSearch } from "./CommandSearch";
import { SyncAgent } from "./SyncAgent";

export function Shell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <SyncAgent />
      <Nav onSearch={() => setSearch(true)} />
      <main id="main">{children}</main>
      <Footer />
      <CommandSearch open={search} onClose={() => setSearch(false)} />
    </MotionConfig>
  );
}
