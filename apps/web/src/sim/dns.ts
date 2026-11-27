import { round1, type ParamDef, type Params, type SimSpec, type Step } from "./engine.ts";

export type DnsNode = "client" | "resolver" | "root" | "tld" | "auth";
export interface DnsState { from: DnsNode; to: DnsNode; line: string; cache: { name: string; ttlLeft: number } | null; elapsed: number }

const NAMES: Record<string, { fqdn: string; tld: string; zone: string; ns: string }> = {
  dev: { fqdn: "api.nexora.dev", tld: ".dev", zone: "nexora.dev", ns: "ns1.nexora.dev" },
  com: { fqdn: "shop.example.com", tld: ".com", zone: "example.com", ns: "ns1.example.com" },
  org: { fqdn: "blog.example.org", tld: ".org", zone: "example.org", ns: "ns1.example.org" },
};
const params: ParamDef[] = [
  { key: "name", label: "Hostname", kind: "select", options: Object.entries(NAMES).map(([v, n]) => ({ value: v, label: n.fqdn })) },
  { key: "cache", label: "Resolver cache", kind: "select", options: [{ value: "cold", label: "Empty" }, { value: "warm", label: "Has the answer" }], hint: "Warm: some earlier client already asked." },
  { key: "ttl", label: "Record TTL", kind: "range", min: 30, max: 3600, step: 30, unit: "s", hint: "How long anyone may reuse the answer." },
  { key: "age", label: "Cached answer age", kind: "range", min: 0, max: 3600, step: 30, unit: "s", hint: "Only matters when the cache has the answer. Older than the TTL means expired." },
  { key: "cname", label: "Record type", kind: "select", options: [{ value: "a", label: "A record" }, { value: "cname", label: "CNAME to a CDN" }], hint: "A CNAME forces a second lookup for the target name." },
  { key: "rtt", label: "Resolver ↔ servers RTT", kind: "range", min: 10, max: 200, step: 10, unit: "ms" },
];
const defaults: Params = { name: "dev", cache: "cold", ttl: 300, age: 120, cname: "a", rtt: 60 };

export function dnsScenario(p: Params): Step<DnsState>[] {
  const n = NAMES[String(p.name)] ?? NAMES.dev!, ttl = Number(p.ttl), age = Number(p.age), rtt = Number(p.rtt);
  const cname = p.cname === "cname", CDN = "edge.cdn-example.net";
  const out: Step<DnsState>[] = [];
  let t = 0, cache: DnsState["cache"] = null;
  const add = (id: string, label: string, explain: string, from: DnsNode, to: DnsNode, line: string, ms: number) => {
    t = round1(t + ms);
    out.push({ id, label, explain, ms: round1(ms), state: { from, to, line, cache: cache && { ...cache }, elapsed: t } });
  };

  add("q", "Ask the resolver", `Your machine hands the question to a recursive resolver. It does the legwork.`, "client", "resolver", `A? ${n.fqdn}`, round1(rtt * 0.15));
  const fresh = p.cache === "warm" && age < ttl;
  if (fresh) {
    cache = { name: n.fqdn, ttlLeft: ttl - age };
    add("hit", "Cache hit", `Cached ${age}s ago with TTL ${ttl}s, so ${ttl - age}s remain. Nobody else is asked.`, "resolver", "resolver", `cache: ${n.fqdn} (TTL ${ttl - age}s left)`, 0.2);
    add("ans", "Answer returned", "One hop instead of the whole walk. This is what a TTL buys.", "resolver", "client", "A 93.184.216.34", round1(rtt * 0.15));
    return out;
  }
  if (p.cache === "warm") add("exp", "Cache entry expired", `The answer is ${age}s old but its TTL was only ${ttl}s. It must not be reused, so the resolver starts the walk.`, "resolver", "resolver", `cache: ${n.fqdn} expired (${age}s ≥ ${ttl}s)`, 0.2);
  else add("miss", "Cache miss", "Nothing stored. The resolver must walk the hierarchy from the top.", "resolver", "resolver", "cache: miss", 0.2);

  const walk = (k: string, name: string, tld: string, zone: string, ns: string) => {
    add(`r${k}`, "Ask a root server", "Roots do not know the answer, but they know who runs each top-level domain.", "resolver", "root", `A? ${name}  (to a.root-servers.net)`, round1(rtt / 2));
    add(`r${k}b`, `Referral to ${tld}`, `A referral, not an answer: here are the servers responsible for ${tld}.`, "root", "resolver", `NS ${tld} → ${tld === ".net" ? "a.gtld-servers.net" : "ns-tld1.example."}`, round1(rtt / 2));
    add(`t${k}`, "Ask the TLD server", `The ${tld} servers know which nameservers hold ${zone}.`, "resolver", "tld", `A? ${name}  (to the ${tld} TLD)`, round1(rtt / 2));
    add(`t${k}b`, `Referral to ${zone}`, "Another referral, one step closer.", "tld", "resolver", `NS ${zone} → ${ns}`, round1(rtt / 2));
    add(`a${k}`, "Ask the authoritative server", "The server that actually owns the records for this zone.", "resolver", "auth", `A? ${name}  (to ${ns})`, round1(rtt / 2));
  };
  walk("1", n.fqdn, n.tld, n.zone, n.ns);
  if (cname) {
    add("alias", "A CNAME, not an address", `The zone says ${n.fqdn} is an alias for ${CDN}. The resolver must now resolve that name too.`, "auth", "resolver", `CNAME ${n.fqdn} → ${CDN}`, round1(rtt / 2));
    walk("2", CDN, ".net", "cdn-example.net", "ns1.cdn-example.net");
  }
  const lastName = cname ? CDN : n.fqdn;
  add("a-end", "The real answer", `An A record with a TTL of ${ttl}s: how long anyone may cache it.`, "auth", "resolver", `A 93.184.216.34  TTL ${ttl}`, round1(rtt / 2));
  cache = { name: n.fqdn, ttlLeft: ttl };
  add("c", "Cache it", `Stored for ${ttl}s so the next asker skips the whole walk${cname ? " (both the alias and its target)" : ""}.`, "resolver", "resolver", `cache: store ${lastName} for ${ttl}s`, 0.2);
  add("ans", "Answer returned", "Only now can your browser open a TCP connection.", "resolver", "client", "A 93.184.216.34", round1(rtt * 0.15));
  return out;
}

export const DNS_SPEC: SimSpec<DnsState> = {
  id: "dns", title: "DNS resolution", params, defaults, scenario: (p) => dnsScenario(p),
  simplifies: [
    "Real resolvers cache referrals (root and TLD delegations) separately from answers, so a second lookup rarely starts at the root. This model keeps one cache and always walks from the root on a miss.",
    "Each server hop is half of the round-trip you choose; real servers differ widely in distance and load.",
    "No DNSSEC, no negative caching, no IPv6, no retries or timeouts, and one answer address only.",
    "TTLs are never decremented by upstream caches here; the age you choose is the only ageing.",
  ],
};
