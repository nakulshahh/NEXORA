import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { sql } from "drizzle-orm";
import { aiRouter, type AiFetch } from "./ai/routes.js";
import { authRouter } from "./auth/routes.js";
import { csrfGuard, loadSession } from "./auth/middleware.js";
import { buildProviders, type Providers } from "./auth/oauth.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { openApiDocument } from "./openapi.js";
import { genReqId } from "./requestId.js";
import type { Mailer } from "./auth/mailer.js";
import { progressRouter } from "./progress/routes.js";

export interface Deps { cfg: Config; db: Db; providers?: Providers; aiFetch?: AiFetch; mailer?: Mailer }

export function createApp({ cfg, db, providers = buildProviders(cfg), aiFetch, mailer }: Deps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", cfg.trustProxy);
  // One structured line per request (pino-http already adds `reqId`, the same field name the AI service uses), no headers (cookies and tokens live there),
  // no probe noise, and the account id (never the email) so one user's trail can be followed.
  app.use(pinoHttp({
    genReqId, level: cfg.env === "test" ? "silent" : cfg.logLevel,
    autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
    customProps: (req) => ({ userId: (req as { auth?: { user: { id: string } } }).auth?.user.id }),
    serializers: {
      req: (req) => ({ method: req.method, url: String(req.url).split("?")[0] }),   // query strings can carry OAuth codes
      res: (res) => ({ statusCode: res.statusCode }),
    },
    redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
  }));
  app.use(helmet({ contentSecurityPolicy: false })); // JSON API: no HTML to protect; the web app sets its own CSP
  app.use(cookieParser(cfg.cookieSecret));
  app.use(express.json({ limit: "256kb" }));

  // Liveness never touches the DB (so a DB blip does not restart the process); readiness does.
  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });
  app.get("/readyz", async (_req, res) => {
    try { await db.execute(sql`select 1`); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });
  app.get("/api/openapi.json", (_req, res) => { res.json(openApiDocument); });

  app.use("/api", csrfGuard(cfg), loadSession(db));
  app.use("/api/auth", authRouter(cfg, db, providers, mailer));
  app.use("/api/progress", progressRouter(db));
  app.use("/api/ai", aiRouter(cfg, db, aiFetch));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
