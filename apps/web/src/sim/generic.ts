/** Shared state shape for the "cells + counters + log line" labs (btree, cache, auth, router, bytes). */
export type Tone = "idle" | "visit" | "hit" | "miss" | "evict" | "field" | "bad";
export interface Cell { label: string; sub?: string; tone: Tone }
export interface GenericState { title: string; cells: Cell[]; metrics: { label: string; value: string }[]; line: string }
