import { rng, round1, type ParamDef, type Params, type SimSpec, type Step } from "./engine.ts";

export type NodeId = "browser" | "dns" | "server" | "cache" | "db";
export type Group = "DNS" | "Connect" | "TLS" | "App" | "Cache" | "Database" | "Response";
export interface HttpState { from: NodeId; to: NodeId; group: Group; wire: { dir: "out" | "in" | "sys"; text: string }[]; elapsed: number }

const params: ParamDef[] = [
  { key: "dns", label: "DNS cache", kind: "select", options: [{ value: "cold", label: "Cold" }, { value: "warm", label: "Warm" }], hint: "Warm: the OS already knows the address." },
  { key: "conn", label: "Connection", kind: "select", options: [{ value: "new", label: "New" }, { value: "reused", label: "Keep-alive" }], hint: "Keep-alive skips the TCP and TLS handshakes." },
  { key: "tls", label: "Protocol", kind: "select", options: [{ value: "on", label: "HTTPS" }, { value: "off", label: "HTTP" }] },
  { key: "cache", label: "App cache", kind: "select", options: [{ value: "miss", label: "Miss" }, { value: "hit", label: "Hit" }], hint: "A hit never touches the database." },
  { key: "rtt", label: "Network round trip", kind: "range", min: 10, max: 300, step: 10, unit: "ms", hint: "Distance to the server." },
];
const defaults: Params = { dns: "cold", conn: "new", tls: "on", cache: "miss", rtt: 80 };

export function httpScenario(p: Params, seed: number): Step<HttpState>[] {
  const rtt = Number(p.rtt), half = rtt / 2, r = rng(seed), https = p.tls === "on";
  const out: Step<HttpState>[] = [];
  let t = 0;
  const add = (id: string, label: string, explain: string, from: NodeId, to: NodeId, group: Group, ms: number, wire: HttpState["wire"]) => {
    t = round1(t + ms);
    out.push({ id, label, explain, ms: round1(ms), state: { from, to, group, wire, elapsed: t } });
  };

  if (p.dns === "warm") add("dns-hit", "Local DNS cache hit", "The OS already knows the address, so there is no network round trip.", "browser", "browser", "DNS", 0.3, [{ dir: "sys", text: "api.nexora.dev → 93.184.216.34 (cached)" }]);
  else {
    add("dns-q", "Resolve the hostname", "Browsers speak IP, not names. A resolver is asked who api.nexora.dev is.", "browser", "dns", "DNS", round1(rtt * 0.4), [{ dir: "out", text: "A? api.nexora.dev" }]);
    add("dns-a", "Address returned", "Root, TLD and authoritative servers answered; the result is cached for its TTL.", "dns", "browser", "DNS", round1(rtt * 0.4), [{ dir: "in", text: "A 93.184.216.34  TTL 300" }]);
  }

  if (p.conn === "reused") add("reuse", "Reuse an open connection", "Keep-alive: the TCP (and TLS) handshakes were paid by an earlier request, so this request pays nothing.", "browser", "browser", "Connect", 0.1, [{ dir: "sys", text: "connection #4 idle → in use" }]);
  else {
    add("syn", "TCP: SYN", "The client proposes a connection and its starting sequence number.", "browser", "server", "Connect", half, [{ dir: "out", text: "SYN seq=x" }]);
    add("synack", "TCP: SYN-ACK", "The server accepts. One full round trip has now passed, and no HTTP has been sent.", "server", "browser", "Connect", half, [{ dir: "in", text: "SYN-ACK seq=y ack=x+1" }]);
    if (https) {
      add("tls-hello", "TLS: ClientHello", "The client offers ciphers and its key share, and names the host via SNI. The final TCP ACK travels with it.", "browser", "server", "TLS", half, [{ dir: "out", text: "ACK" }, { dir: "out", text: "ClientHello (key share, SNI)" }]);
      add("tls-done", "TLS: ServerHello + certificate", "TLS 1.3 needs one round trip: after this the channel is encrypted and the server is verified.", "server", "browser", "TLS", half, [{ dir: "in", text: "ServerHello, Certificate, Finished" }]);
    }
  }

  const lines: HttpState["wire"] = [{ dir: "out", text: "GET /users/42 HTTP/1.1" }, { dir: "out", text: "Host: api.nexora.dev" }, { dir: "out", text: "Accept: application/json" }];
  add("req", "Send the request", https ? "Now, finally, the HTTP request travels, encrypted inside TLS." : "The HTTP request travels as plain text; anyone on the path can read it.", "browser", "server", "Connect", half, lines);
  add("mw", "Middleware chain", "Authenticate, validate, route: the framework's machinery, in order.", "server", "server", "App", round1(1.5 + r() * 2), [{ dir: "sys", text: "auth ✓ → validate ✓ → route /users/:id → handler" }]);
  add("cache-q", "Ask the cache first", "A memory lookup is far cheaper than a disk-backed query.", "server", "cache", "Cache", 0.5, [{ dir: "out", text: "GET user:42" }]);
  if (p.cache === "hit") add("cache-hit", "Cache hit", "The row was already in memory. The database is never touched.", "cache", "server", "Cache", 0.5, [{ dir: "in", text: '{"id":42,"name":"Ada"}  (hit)' }]);
  else {
    add("cache-miss", "Cache miss", "Nothing stored under this key, so the request falls through to the database.", "cache", "server", "Cache", 0.5, [{ dir: "in", text: "(nil)" }]);
    add("db-q", "Query the database", "A pooled connection is borrowed and the SQL is sent.", "server", "db", "Database", 0.6, [{ dir: "out", text: "SELECT * FROM users WHERE id = 42;" }]);
    add("db-x", "Index lookup", "A B-tree descends a few pages instead of scanning the table.", "db", "db", "Database", round1(2 + r() * 6), [{ dir: "sys", text: "Index Scan using users_pkey" }]);
    add("db-a", "Row returned", "One row travels back over the pooled connection.", "db", "server", "Database", 0.6, [{ dir: "in", text: "(42, 'Ada', 'ada@nexora.dev')" }]);
    add("cache-set", "Fill the cache", "Store the result so the next request skips the database.", "server", "cache", "Cache", 0.5, [{ dir: "out", text: "SET user:42 EX 60" }]);
  }
  add("ser", "Serialize the response", "The in-memory object becomes JSON bytes.", "server", "server", "App", 0.4, [{ dir: "sys", text: "JSON.stringify(user)" }]);
  add("resp", "Response travels back", "Status line, headers, body. The browser can now render.", "server", "browser", "Response", half, [{ dir: "in", text: "HTTP/1.1 200 OK" }, { dir: "in", text: "Content-Type: application/json" }, { dir: "in", text: '{"id":42,"name":"Ada"}' }]);
  return out;
}

export const HTTP_SPEC: SimSpec<HttpState> = {
  id: "http", title: "HTTP request lifecycle", params, defaults, scenario: httpScenario,
  simplifies: [
    "Latencies are a simple model (round trips and fixed costs), not measurements. Real networks vary with loss, congestion and routing.",
    "A cold DNS lookup is shown as one round trip split in two; a real one walks several servers (see the DNS lab).",
    "TLS is modelled as TLS 1.3 without resumption. HTTP/2 and HTTP/3 multiplexing are not shown.",
    "Server and database work uses small seeded random costs so different seeds differ slightly; the same seed always gives the same run.",
  ],
};
export const HTTP_GROUPS: Group[] = ["DNS", "Connect", "TLS", "App", "Cache", "Database", "Response"];
