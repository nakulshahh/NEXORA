/**
 * ILLUSTRATIVE step list for the landing-page hero.
 * The real, tested, deterministic engine (docs/BLUEPRINT.md §9) lands in Milestone 4;
 * the shape here deliberately matches it: pure function of options -> Step[].
 */
export type NodeId = "browser" | "dns" | "server" | "cache" | "db";
export type Group = "DNS" | "Connect" | "App" | "Cache" | "Database" | "Response";

export interface HttpStep {
  id: string;
  from: NodeId;
  to: NodeId; // same as from => work happening inside a node
  group: Group;
  ms: number;
  title: string;
  note: string;
  wire: { dir: "out" | "in" | "sys"; text: string }[];
}
export interface HttpOpts { dnsWarm: boolean; cacheHit: boolean }

export function buildHttpSteps({ dnsWarm, cacheHit }: HttpOpts): HttpStep[] {
  const s: HttpStep[] = [];
  if (dnsWarm) {
    s.push({ id: "dns-hit", from: "browser", to: "browser", group: "DNS", ms: 0.3, title: "Local DNS cache hit", note: "The OS already knows the address, so no network round trip is needed.",
      wire: [{ dir: "sys", text: "api.nexora.dev → 93.184.216.34 (cached, TTL 214s)" }] });
  } else {
    s.push({ id: "dns-q", from: "browser", to: "dns", group: "DNS", ms: 14, title: "Resolve the hostname", note: "Browsers speak IP, not names. The resolver is asked who api.nexora.dev is.",
      wire: [{ dir: "out", text: "A? api.nexora.dev" }] });
    s.push({ id: "dns-a", from: "dns", to: "browser", group: "DNS", ms: 14, title: "Address returned", note: "Root, TLD and authoritative servers answered; the result is cached for its TTL.",
      wire: [{ dir: "in", text: "A 93.184.216.34  TTL 300" }] });
  }
  s.push({ id: "connect", from: "browser", to: "server", group: "Connect", ms: 36, title: "Connect, then send the request", note: "TCP handshake and TLS first; only then does the HTTP request travel.",
    wire: [{ dir: "sys", text: "SYN → SYN-ACK → ACK · TLS 1.3 handshake" }, { dir: "out", text: "GET /users/42 HTTP/1.1" }, { dir: "out", text: "Host: api.nexora.dev" }, { dir: "out", text: "Accept: application/json" }] });
  s.push({ id: "mw", from: "server", to: "server", group: "App", ms: 3, title: "Middleware chain", note: "Authenticate, validate, route: the framework's machinery, in order.",
    wire: [{ dir: "sys", text: "auth ✓ → validate ✓ → route /users/:id → handler" }] });
  s.push({ id: "cache-q", from: "server", to: "cache", group: "Cache", ms: 1, title: "Ask the cache first", note: "A memory lookup is orders of magnitude cheaper than a disk-backed query.",
    wire: [{ dir: "out", text: "GET user:42" }] });
  if (cacheHit) {
    s.push({ id: "cache-hit", from: "cache", to: "server", group: "Cache", ms: 1, title: "Cache hit", note: "The row was already in memory. The database is never touched.",
      wire: [{ dir: "in", text: '{"id":42,"name":"Ada"}  (hit)' }] });
  } else {
    s.push({ id: "cache-miss", from: "cache", to: "server", group: "Cache", ms: 1, title: "Cache miss", note: "Nothing stored under this key. The request falls through to the database.",
      wire: [{ dir: "in", text: "(nil)" }] });
    s.push({ id: "db-q", from: "server", to: "db", group: "Database", ms: 6, title: "Query the database", note: "A connection is borrowed from the pool and the SQL is sent.",
      wire: [{ dir: "out", text: "SELECT * FROM users WHERE id = 42;" }] });
    s.push({ id: "db-x", from: "db", to: "db", group: "Database", ms: 4, title: "Index lookup", note: "A B-tree descends a few pages instead of scanning the table.",
      wire: [{ dir: "sys", text: "Index Scan using users_pkey  (cost 0.29..8.30)" }] });
    s.push({ id: "db-a", from: "db", to: "server", group: "Database", ms: 6, title: "Row returned", note: "One row travels back over the pooled connection.",
      wire: [{ dir: "in", text: "(42, 'Ada', 'ada@nexora.dev')" }] });
    s.push({ id: "cache-set", from: "server", to: "cache", group: "Cache", ms: 1, title: "Fill the cache", note: "Store the result so the next request skips the database.",
      wire: [{ dir: "out", text: "SET user:42 EX 60" }] });
  }
  s.push({ id: "ser", from: "server", to: "server", group: "App", ms: 0.4, title: "Serialize the response", note: "The in-memory object becomes JSON bytes.",
    wire: [{ dir: "sys", text: "JSON.stringify(user) → 42 bytes" }] });
  s.push({ id: "resp", from: "server", to: "browser", group: "Response", ms: 18, title: "Response travels back", note: "Status line, headers, body. The browser can now render.",
    wire: [{ dir: "in", text: "HTTP/1.1 200 OK" }, { dir: "in", text: "Content-Type: application/json" }, { dir: "in", text: '{"id":42,"name":"Ada"}' }] });
  return s;
}

export const GROUPS: Group[] = ["DNS", "Connect", "App", "Cache", "Database", "Response"];
