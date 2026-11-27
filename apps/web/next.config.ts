import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./security-headers";

/**
 * The browser only ever talks to this origin. `/api/*` is proxied to the Express service, so the session cookie is
 * first-party (no cross-site cookie rules, no CORS) whether the API runs on Render, Fly, a VM or localhost.
 * Changing API host = changing one environment variable.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/$/, "");

const config: NextConfig = {
  reactStrictMode: true,
  // Docker/self-host builds set NEXT_OUTPUT=standalone to get a self-contained server (no node_modules copy). Vercel ignores this.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const, outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)) } : {}),
  poweredByHeader: false,
  async headers() { return securityHeaders(process.env.NODE_ENV === "production"); },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};
export default config;
