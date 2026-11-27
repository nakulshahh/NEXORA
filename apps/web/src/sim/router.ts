import type { ParamDef, Params, SimSpec, Step } from "./engine.ts";
import type { GenericState } from "./generic.ts";

interface Route { method: string; path: string }
const SPECIFIC_FIRST: Route[] = [{ method: "GET", path: "/users/me" }, { method: "GET", path: "/users/:id/posts" }, { method: "GET", path: "/users/:id" }, { method: "POST", path: "/users" }, { method: "GET", path: "/files/*" }];
const PARAM_FIRST: Route[] = [{ method: "GET", path: "/users/:id" }, { method: "GET", path: "/users/:id/posts" }, { method: "GET", path: "/users/me" }, { method: "POST", path: "/users" }, { method: "GET", path: "/files/*" }];
const PATHS = ["/users/me", "/users/42", "/users/42/posts", "/files/a/b.txt", "/teapot"];
const params: ParamDef[] = [
  { key: "method", label: "Request method", kind: "select", options: [{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }, { value: "DELETE", label: "DELETE" }] },
  { key: "path", label: "Request path", kind: "select", options: PATHS.map((v) => ({ value: v, label: v })) },
  { key: "order", label: "Registration order", kind: "select", options: [{ value: "specific", label: "Specific routes first" }, { value: "param", label: "/users/:id first" }] },
];
const defaults: Params = { method: "GET", path: "/users/me", order: "specific" };

/** Match a path pattern: ":x" is one segment, a trailing "*" swallows the rest. Returns captured params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean), b = path.split("/").filter(Boolean), got: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "*") return i <= b.length ? got : null;
    if (b[i] === undefined) return null;
    if (a[i]!.startsWith(":")) got[a[i]!.slice(1)] = b[i]!; else if (a[i] !== b[i]) return null;
  }
  return a.length === b.length ? got : null;
}

export function routerScenario(p: Params): Step<GenericState>[] {
  const routes = p.order === "param" ? PARAM_FIRST : SPECIFIC_FIRST, method = String(p.method), path = String(p.path), out: Step<GenericState>[] = [];
  const tones: ("idle" | "miss" | "hit" | "bad")[] = routes.map(() => "idle");
  const cells = (): GenericState["cells"] => routes.map((r, i) => ({ label: `${r.method} ${r.path}`, tone: tones[i]! }));
  const pathOnly: number[] = [];
  const mk = (title: string, line: string, tried: number): GenericState => ({ title, line, cells: cells(), metrics: [{ label: "Routes tried", value: String(tried) }, { label: "Routes", value: String(routes.length) }] });
  out.push({ id: "in", label: `Request ${method} ${path}`, explain: "Express-style routers test routes in the order they were registered and stop at the first match, so order is part of the program.", ms: 0, state: mk("Routes, in order", `${method} ${path}`, 0) });
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!, m = matchPath(r.path, path);
    if (m && r.method === method) {
      tones[i] = "hit"; const caps = Object.entries(m).map(([k, v]) => `${k}=${v}`).join(", ");
      const shadowed = routes.slice(i + 1).some((x) => x.method === method && matchPath(x.path, path));
      out.push({ id: `t${i}`, label: `Try ${r.method} ${r.path}: match`, explain: `Method and path both match${caps ? ` and capture ${caps}` : ""}. The router stops here and calls this handler.${shadowed ? " A later, more specific route also matches this request and will never run: it is shadowed." : ""}`, ms: 0, state: mk("Routes, in order", `-> handler for ${r.method} ${r.path}${caps ? ` {${caps}}` : ""}`, i + 1) });
      out.push({ id: "done", label: "Handler runs", explain: path === "/users/me" && r.path === "/users/:id" ? "Bug: /users/me was captured as an id of \"me\". Register /users/me before /users/:id." : "The matched handler produces the response.", ms: 0, state: mk("Routes, in order", path === "/users/me" && r.path === "/users/:id" ? "id = \"me\" (probably a bug)" : "200", i + 1) });
      return out;
    }
    if (m) pathOnly.push(i);
    tones[i] = "miss";
    out.push({ id: `t${i}`, label: `Try ${r.method} ${r.path}: no match`, explain: m ? `The path matches but the method is ${r.method}, not ${method}, so this route does not apply (remembered for a 405).` : "The path pattern does not match this request, so move on to the next route.", ms: 0, state: mk("Routes, in order", `no: ${r.method} ${r.path}`, i + 1) });
  }
  const is405 = pathOnly.length > 0;
  out.push({ id: "done", label: is405 ? "405 Method Not Allowed" : "404 Not Found", explain: is405 ? `No route accepts ${method} ${path}, but another method does. Say 405 and send an Allow header, not 404.` : "No route matched at all. The final fallback returns 404.", ms: 0, state: { ...mk("Routes, in order", is405 ? "405" : "404", routes.length), cells: cells().map((c) => ({ ...c, tone: "bad" as const })) } });
  return out;
}
export const ROUTER_SPEC: SimSpec<GenericState> = {
  id: "router", title: "Router matching trace", params, defaults, scenario: routerScenario,
  simplifies: ["Only literal segments, :param segments and a trailing * exist; real routers add regexes, optional segments and case rules.", "No middleware, no query string and no trailing-slash rules.", "Real routers (find-my-way, Fastify, Go's mux) use tries and are not tested one route at a time, but must keep the same observable priority."],
};
