"use client";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "nexora-theme";
const listeners = new Set<() => void>();
const read = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem(KEY, next); } catch {}
        listeners.forEach((l) => l());
      }}
      className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-strong hover:text-ink"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/** Runs before first paint (inlined in <head>) so there is no theme flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
