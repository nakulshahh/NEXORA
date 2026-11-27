import type { SimSpec } from "./engine.ts";
import { HTTP_SPEC } from "./http.ts";
import { DNS_SPEC } from "./dns.ts";
import { EVENT_LOOP_SPEC } from "./eventloop.ts";
import { BTREE_SPEC } from "./btree.ts";
import { CACHE_SPEC } from "./cache.ts";
import { AUTH_SPEC } from "./auth.ts";
import { ROUTER_SPEC } from "./router.ts";
import { BYTES_SPEC } from "./bytes.ts";

export const SIMS = { http: HTTP_SPEC, dns: DNS_SPEC, "event-loop": EVENT_LOOP_SPEC, router: ROUTER_SPEC, bytes: BYTES_SPEC, auth: AUTH_SPEC, btree: BTREE_SPEC, cache: CACHE_SPEC } as const;
export type SimId = keyof typeof SIMS;
export const SIM_IDS = Object.keys(SIMS) as SimId[];
export const specOf = (id: string): SimSpec<unknown> | undefined => (SIMS as Record<string, SimSpec<unknown>>)[id];
