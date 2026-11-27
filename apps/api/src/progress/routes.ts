import { Router } from "express";
import type { Db } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { parse } from "../http.js";
import { MergeBody } from "./model.js";
import { mergeProgress, readProgress, resetProgress } from "./repo.js";

/**
 * There is deliberately no user id or resource id in these URLs: the owner is always req.auth.user.id,
 * so there is no identifier an attacker could change to reach someone else's data.
 */
export function progressRouter(db: Db) {
  const r = Router();
  r.use(requireAuth);
  r.get("/", async (req, res) => { res.json({ progress: await readProgress(db, req.auth!.user.id) }); });
  r.post("/merge", async (req, res) => {
    const body = parse(MergeBody, req.body);
    await mergeProgress(db, req.auth!.user.id, body.progress, body.knownMode);
    res.json({ progress: await readProgress(db, req.auth!.user.id) });
  });
  r.delete("/", async (req, res) => { await resetProgress(db, req.auth!.user.id); res.status(204).end(); });
  return r;
}
