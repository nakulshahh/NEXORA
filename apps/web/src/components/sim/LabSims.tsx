"use client";
import { AUTH_SPEC } from "@/sim/auth";
import { BTREE_SPEC } from "@/sim/btree";
import { BYTES_SPEC } from "@/sim/bytes";
import { CACHE_SPEC } from "@/sim/cache";
import { ROUTER_SPEC } from "@/sim/router";
import { makeGenericSim } from "./GenericSim";

export const RouterSim = makeGenericSim(ROUTER_SPEC);
export const BytesSim = makeGenericSim(BYTES_SPEC);
export const AuthSim = makeGenericSim(AUTH_SPEC);
export const BtreeSim = makeGenericSim(BTREE_SPEC);
export const CacheSim = makeGenericSim(CACHE_SPEC);
