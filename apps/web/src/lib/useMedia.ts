"use client";
import { useSyncExternalStore } from "react";

export function useMedia(query: string, server = false) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(query).matches,
    () => server,
  );
}
