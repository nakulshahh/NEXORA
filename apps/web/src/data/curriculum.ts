/**
 * NEXORA curriculum metadata — mirrors docs/BLUEPRINT.md §2.
 * Source of truth moves to MDX frontmatter in M3; this file is the M2 stand-in.
 */
export type Tier = 1 | 2 | 3;

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  tier: Tier;
  prereqs: string[];
  /** Flagship simulation planned for this chapter, if any. */
  sim?: string;
  /** Part of the v1 vertical slice (fully authored in M3+). */
  slice?: boolean;
}

export interface Part {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  chapters: Chapter[];
}

export const PARTS: Part[] = [
  {
    id: "0",
    slug: "foundations",
    title: "Foundations",
    blurb: "The ground everything stands on: networks, processes and the I/O model.",
    chapters: [
      { id: "0.1", title: "What a backend actually is", summary: "Clients, servers and the request→response mental model.", tier: 1, prereqs: [], sim: "Request journey" },
      { id: "0.2", title: "Networking essentials", summary: "IP, ports, TCP, UDP, DNS and TLS — how two machines find and trust each other.", tier: 1, prereqs: ["0.1"], sim: "DNS resolution · TCP handshake", slice: true },
      { id: "0.3", title: "Processes, threads & the event loop", summary: "I/O models, why Node is single-threaded and still fast.", tier: 1, prereqs: ["0.1"], sim: "Event loop", slice: true },
      { id: "0.4", title: "Linux, shell & dev environment", summary: "Just enough OS to be dangerous.", tier: 2, prereqs: [] },
    ],
  },
  {
    id: "A",
    slug: "request-path",
    title: "The Request Path",
    blurb: "How bytes on a socket become a handled request.",
    chapters: [
      { id: "A1", title: "HTTP & CORS", summary: "The protocol, its semantics, and why browsers police cross-origin calls.", tier: 1, prereqs: ["0.2"], sim: "HTTP request lifecycle", slice: true },
      { id: "A2", title: "Routing", summary: "How a URL finds its handler.", tier: 1, prereqs: ["A1"], sim: "Router matching trace" },
      { id: "A3", title: "Serialization & deserialization", summary: "JSON, Protobuf and the bytes underneath.", tier: 2, prereqs: ["A1"], sim: "Byte-level view" },
      { id: "A4", title: "Authentication & authorization", summary: "Sessions, JWTs and who may do what.", tier: 1, prereqs: ["A1", "A3"], sim: "Session vs JWT", slice: true },
      { id: "A5", title: "Validation & transformations", summary: "Never trust input; shape it once, at the edge.", tier: 2, prereqs: ["A3"] },
      { id: "A6", title: "Controllers, services & middleware", summary: "Layering that survives growth.", tier: 1, prereqs: ["A2", "A5"], sim: "Middleware chain stepper" },
      { id: "A7", title: "REST API design", summary: "Pagination, filtering, idempotency, versioning.", tier: 2, prereqs: ["A6"] },
    ],
  },
  {
    id: "B",
    slug: "state-and-machinery",
    title: "State & Machinery",
    blurb: "Where data lives and the moving parts around it.",
    chapters: [
      { id: "B1", title: "Database fundamentals", summary: "Pages, WAL and connection pools.", tier: 1, prereqs: ["0.3"], sim: "Connection pool" },
      { id: "B2", title: "SQL & relational modeling", summary: "Schemas, joins and migrations.", tier: 1, prereqs: ["B1"] },
      { id: "B3", title: "Indexes & B-trees", summary: "Why a lookup takes milliseconds, and how to read a query plan.", tier: 1, prereqs: ["B2"], sim: "Scan vs B-tree", slice: true },
      { id: "B4", title: "Transactions, ACID & isolation", summary: "Locks, MVCC and anomalies.", tier: 1, prereqs: ["B2"], sim: "Isolation anomaly lab" },
      { id: "B5", title: "NoSQL & data-model trade-offs", summary: "When not to use a relational database.", tier: 3, prereqs: ["B2"] },
      { id: "B6", title: "Caching & Redis", summary: "Hits, misses, eviction and invalidation.", tier: 1, prereqs: ["B1", "A7"], sim: "Cache hit / miss / evict", slice: true },
      { id: "B7", title: "Task queues & background jobs", summary: "Deferring work safely.", tier: 1, prereqs: ["A6", "B4"], sim: "Queue + retries" },
      { id: "B8", title: "Full-text search", summary: "Inverted indexes, Postgres FTS, Elasticsearch.", tier: 2, prereqs: ["B3"], sim: "Inverted index builder" },
      { id: "B9", title: "Error handling & fault tolerance", summary: "Timeouts, backoff, circuit breakers, idempotency.", tier: 2, prereqs: ["A6"], sim: "Retry storm" },
      { id: "B10", title: "gRPC & inter-service communication", summary: "Protobuf and typed RPC.", tier: 3, prereqs: ["A3"] },
      { id: "B11", title: "Configuration & secrets", summary: "Twelve-factor, without the dogma.", tier: 2, prereqs: ["A6"] },
    ],
  },
  {
    id: "C",
    slug: "running-in-production",
    title: "Running in Production",
    blurb: "Keeping systems observable, secure and fast.",
    chapters: [
      { id: "C1", title: "Logging, metrics & tracing", summary: "Seeing inside a running system.", tier: 2, prereqs: ["A6"], sim: "Trace waterfall" },
      { id: "C2", title: "Graceful shutdown", summary: "Stop without dropping requests.", tier: 2, prereqs: ["0.3", "A6"], sim: "Shutdown stepper" },
      { id: "C3", title: "Backend security", summary: "OWASP, rate limiting, secrets.", tier: 1, prereqs: ["A4"], sim: "Attack / defense lab" },
      { id: "C4", title: "Scaling & performance", summary: "Reverse proxies, load balancing, CDNs, replication, sharding.", tier: 1, prereqs: ["B6"], sim: "Load balancer" },
      { id: "C5", title: "Concurrency & parallelism", summary: "Races, locks and worker models.", tier: 2, prereqs: ["0.3"], sim: "Race condition lab" },
    ],
  },
  {
    id: "D",
    slug: "distribution-and-scale",
    title: "Distribution & Scale",
    blurb: "Shipping, testing and connecting services.",
    chapters: [
      { id: "D1", title: "Docker", summary: "Images, layers, containers.", tier: 2, prereqs: ["0.4"], sim: "Layer cache viewer" },
      { id: "D2", title: "Kubernetes", summary: "Scheduling and rollouts.", tier: 3, prereqs: ["D1"], sim: "Scheduler / rollout" },
      { id: "D3", title: "CI/CD", summary: "From commit to production.", tier: 3, prereqs: ["D1"], sim: "Pipeline stepper" },
      { id: "D4", title: "Automated testing", summary: "What to test, and what not to.", tier: 2, prereqs: ["A6"] },
      { id: "D5", title: "Message brokers & Kafka", summary: "Producers, brokers, consumers, offsets.", tier: 2, prereqs: ["B7"], sim: "Producer / broker / consumer" },
      { id: "D6", title: "WebSockets & real-time", summary: "Long-lived connections and fan-out.", tier: 2, prereqs: ["A1"], sim: "Fan-out" },
    ],
  },
  {
    id: "E",
    slug: "modern-backend",
    title: "Modern Backend Engineering",
    blurb: "Contracts, agents and AI in production.",
    chapters: [
      { id: "E1", title: "OpenAPI & API documentation", summary: "Contracts that generate code.", tier: 2, prereqs: ["A7"] },
      { id: "E2", title: "AI agents & backend workflows", summary: "Loops, tools and failure handling.", tier: 3, prereqs: ["B7", "B9"] },
      { id: "E3", title: "Production AI integration", summary: "RAG, evals, cost and guardrails.", tier: 3, prereqs: ["E2", "B3"] },
    ],
  },
  {
    id: "F",
    slug: "system-design",
    title: "System Design",
    blurb: "Putting the machinery together under constraints.",
    chapters: [
      { id: "F0", title: "Distributed systems fundamentals", summary: "CAP, consistency, replication, clocks.", tier: 3, prereqs: ["B4", "C4"] },
      { id: "F1", title: "Method: requirements & estimation", summary: "Back-of-envelope numbers and trade-off write-ups.", tier: 3, prereqs: ["F0"] },
      { id: "F2", title: "URL shortener", summary: "The classic, done properly.", tier: 3, prereqs: ["F1"] },
      { id: "F3", title: "Rate limiter", summary: "Token buckets and sliding windows.", tier: 3, prereqs: ["F1", "B6"] },
      { id: "F4", title: "Notification system", summary: "Fan-out with retries.", tier: 3, prereqs: ["F1", "B7", "D5"] },
      { id: "F5", title: "Chat application", summary: "Presence, ordering, delivery.", tier: 3, prereqs: ["F1", "D6"] },
      { id: "F6", title: "File storage service", summary: "Chunking, metadata, object stores.", tier: 3, prereqs: ["F1"] },
      { id: "F7", title: "News feed", summary: "Push vs pull fan-out.", tier: 3, prereqs: ["F1", "F4"] },
    ],
  },
];

export const ALL_CHAPTERS: (Chapter & { partId: string; partSlug: string; partTitle: string })[] = PARTS.flatMap((p) =>
  p.chapters.map((c) => ({ ...c, partId: p.id, partSlug: p.slug, partTitle: p.title })),
);

export const CHAPTER_BY_ID = new Map(ALL_CHAPTERS.map((c) => [c.id, c]));
export const SLICE = ALL_CHAPTERS.filter((c) => c.slice);

/** Chapters that must be done before `id` (direct + transitive), in blueprint order. */
export function transitivePrereqs(id: string): string[] {
  const seen = new Set<string>();
  const walk = (x: string) => {
    for (const p of CHAPTER_BY_ID.get(x)?.prereqs ?? []) {
      if (!seen.has(p)) { seen.add(p); walk(p); }
    }
  };
  walk(id);
  return ALL_CHAPTERS.map((c) => c.id).filter((x) => seen.has(x));
}

/** Chapters that directly depend on `id`. */
export function dependents(id: string): string[] {
  return ALL_CHAPTERS.filter((c) => c.prereqs.includes(id)).map((c) => c.id);
}

export const TIER_LABEL: Record<Tier, string> = { 1: "Core", 2: "Extended", 3: "Advanced" };

export const LABS = [
  { id: "http", title: "HTTP request lifecycle", chapter: "A1", blurb: "Follow one request from browser to database and back." },
  { id: "dns", title: "DNS resolution", chapter: "0.2", blurb: "Resolver, root, TLD, authoritative — and the cache that skips them." },
  { id: "event-loop", title: "Node.js event loop", chapter: "0.3", blurb: "Call stack, microtasks, timers: who runs next, and why." },
  { id: "router", title: "Router matching trace", chapter: "A2", blurb: "Routes are tried in order and the first match wins: watch a request find, or miss, its handler." },
  { id: "bytes", title: "Byte-level view", chapter: "A3", blurb: "See how characters become bytes in UTF-8 and UTF-16, and why length is not size." },
  { id: "btree", title: "Scan vs B-tree", chapter: "B3", blurb: "Count the pages touched by a full scan versus an index lookup." },
  { id: "cache", title: "Cache hit / miss / evict", chapter: "B6", blurb: "Watch eviction policy decide what survives." },
  { id: "break-it", title: "Break-it Lab", chapter: "B9", blurb: "Inject a failure, read the symptoms, find the root cause, fix it and prove it." },
  { id: "concurrency", title: "Concurrency Arena", chapter: "C5", blurb: "Choose the order threads run in: see lost updates, deadlock and buffer bugs, then fix them with locks, atomics and semaphores." },
  { id: "auth", title: "Session vs JWT", chapter: "A4", blurb: "Where the state lives, and what revocation costs." },
] as const;

/** Labs that are standalone pages rather than SimShell simulations. */
export const PAGE_LABS: string[] = ["break-it", "concurrency"];
