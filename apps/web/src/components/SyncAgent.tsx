"use client";
import { useEffect } from "react";
import { refreshAuth, useAuth } from "@/lib/auth";
import { startSync } from "@/lib/sync";

/** Mounted once in the shell. Asks "who am I?" on load, and starts/stops progress sync when that changes. */
export function SyncAgent() {
  const { user } = useAuth();
  useEffect(() => { refreshAuth(); }, []);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshAuth(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => { startSync(user); }, [user]);
  return null;
}
