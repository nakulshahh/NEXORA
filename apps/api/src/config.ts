import { z } from "zod";

/**
 * All configuration comes from environment variables, validated once at startup.
 * Nothing here is provider-specific: any Postgres URL, any host that sets PORT, any reverse proxy.
 */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  /** Origin(s) of the web app, comma separated. Used for CORS-free CSRF checks and OAuth redirects. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Signs the short-lived OAuth state cookie. Must be long and random in production. */
  COOKIE_SECRET: z.string().min(32),
  /** Number of reverse-proxy hops to trust for client IPs (Render: 1). 0 = none. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Set to "false" only in tests. */
  RATE_LIMIT: z.enum(["true", "false"]).default("true"),
  DATABASE_SSL: z.enum(["require", "disable"]).optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  /** Base URL of the AI Professor service. Unset = the feature reports itself unavailable. */
  AI_SERVICE_URL: z.string().url().optional(),
  /** Shared secret sent as X-Internal-Token; required in production when AI_SERVICE_URL is set. */
  AI_INTERNAL_TOKEN: z.string().min(16).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  const webOrigins = e.WEB_ORIGIN.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const primary = webOrigins[0];
  if (!primary) throw new Error("Invalid environment:\n  WEB_ORIGIN: at least one origin required");
  for (const o of webOrigins) new URL(o); // throws on garbage
  const production = e.NODE_ENV === "production";
  if (production && webOrigins.some((o) => !o.startsWith("https://"))) {
    throw new Error("Invalid environment:\n  WEB_ORIGIN: must be https in production");
  }
  if (production && e.AI_SERVICE_URL && !e.AI_INTERNAL_TOKEN) {
    throw new Error("Invalid environment:\n  AI_INTERNAL_TOKEN: required in production when AI_SERVICE_URL is set");
  }
  return {
    env: e.NODE_ENV,
    production,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseSsl: e.DATABASE_SSL,
    webOrigins,
    primaryOrigin: primary,
    cookieSecret: e.COOKIE_SECRET,
    secureCookies: production || primary.startsWith("https://"),
    trustProxy: e.TRUST_PROXY,
    rateLimit: e.RATE_LIMIT === "true",
    logLevel: e.LOG_LEVEL,
    ai: e.AI_SERVICE_URL ? { url: e.AI_SERVICE_URL.replace(/\/$/, ""), token: e.AI_INTERNAL_TOKEN ?? null, timeoutMs: e.AI_TIMEOUT_MS } : null,
    github: e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET ? { id: e.GITHUB_CLIENT_ID, secret: e.GITHUB_CLIENT_SECRET } : null,
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { id: e.GOOGLE_CLIENT_ID, secret: e.GOOGLE_CLIENT_SECRET } : null,
  };
}
