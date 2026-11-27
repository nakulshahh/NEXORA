"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export const SPEEDS = [0.5, 1, 2, 4] as const;
const DWELL_MS = 1600;

/**
 * Player over a precomputed step list. Pure state machine plus one timer.
 * Under prefers-reduced-motion it never autoplays: the learner steps with the buttons or the arrow keys.
 */
export function usePlayer(length: number, initial = 0) {
  const reduce = !!useReducedMotion();
  const [index, setIndex] = useState(() => Math.min(Math.max(initial, 0), Math.max(length - 1, 0)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const last = Math.max(length - 1, 0);

  // A new step list (parameters changed) can be shorter than the old index.
  useEffect(() => { setIndex((i) => Math.min(i, last)); }, [last]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!playing || reduce) return;
    if (index >= last) { setPlaying(false); return; }
    timer.current = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), DWELL_MS / speed);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, index, last, speed, reduce]);

  const seek = useCallback((i: number) => setIndex(Math.min(Math.max(i, 0), last)), [last]);
  return {
    index, playing: playing && !reduce, speed, setSpeed, reduce, last, seek,
    play: () => { if (reduce) return; if (index >= last) setIndex(0); setPlaying(true); },
    pause: () => setPlaying(false),
    toggle: () => { if (reduce) return; if (playing) setPlaying(false); else { if (index >= last) setIndex(0); setPlaying(true); } },
    next: () => { setPlaying(false); seek(index + 1); },
    prev: () => { setPlaying(false); seek(index - 1); },
    reset: () => { setPlaying(false); setIndex(0); },
  };
}
