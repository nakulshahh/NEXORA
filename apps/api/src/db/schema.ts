import { bigint, bigserial, boolean, index, integer, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Always stored lower-cased and trimmed (see normalizeEmail). */
  email: text("email").notNull(),
  /** null = OAuth-only account. */
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  lastChapter: text("last_chapter"),
  createdAt: now(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

/** A linked external login. One user can have several. */
export const identities = pgTable("identities", {
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index("identities_user_idx").on(t.userId)]);

/** `id` is the SHA-256 of the cookie token; a database leak does not leak usable sessions. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Public handle for listing/revoking sessions; never the secret. */
  publicId: uuid("public_id").notNull().defaultRandom(),
  createdAt: now(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId), uniqueIndex("sessions_public_uq").on(t.publicId)]);

export const knownChapters = pgTable("known_chapters", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapter: text("chapter").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.chapter] })]);

export const completedChapters = pgTable("completed_chapters", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapter: text("chapter").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.chapter] })]);

export const lessonProgress = pgTable("lesson_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapter: text("chapter").notNull(),
  slug: text("slug").notNull(),
  done: boolean("done").notNull().default(false),
  /** 0..1, monotonic. */
  scroll: real("scroll").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.chapter, t.slug] })]);

export const exerciseState = pgTable("exercise_state", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapter: text("chapter").notNull(),
  slug: text("slug").notNull(),
  exerciseId: text("exercise_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  correct: boolean("correct").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.chapter, t.slug, t.exerciseId] })]);

export const activityEvents = pgTable("activity_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Client time in ms since epoch. */
  t: bigint("t", { mode: "number" }).notNull(),
  kind: text("kind").notNull(),
  chapter: text("chapter").notNull(),
}, (t) => [uniqueIndex("activity_dedupe_uq").on(t.userId, t.t, t.kind, t.chapter), index("activity_user_t_idx").on(t.userId, t.t)]);


/**
 * Spaced-repetition state, one row per (user, exercise). Merge rule: the row with the newest review wins
 * (a last-writer-wins register per card), so devices converge without coordination. Ease is stored in hundredths
 * to avoid float round-trips.
 */
export const cardReviews = pgTable("card_reviews", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapter: text("chapter").notNull(),
  slug: text("slug").notNull(),
  exerciseId: text("exercise_id").notNull(),
  easeX100: integer("ease_x100").notNull(),
  intervalDays: integer("interval_days").notNull(),
  reps: integer("reps").notNull(),
  lapses: integer("lapses").notNull(),
  due: bigint("due", { mode: "number" }).notNull(),
  last: bigint("last", { mode: "number" }).notNull(),
  first: boolean("first").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.chapter, t.slug, t.exerciseId] })]);

/** Counters for the shared rate limiter. `key` is "<limiter>:<client>"; a row is reset in place when its window ends. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Only the SHA-256 of the emailed token is stored. Single use (used_at), short lived (expires_at). */
export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("password_resets_user_idx").on(t.userId)]);
