CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"t" bigint NOT NULL,
	"kind" text NOT NULL,
	"chapter" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completed_chapters" (
	"user_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	CONSTRAINT "completed_chapters_user_id_chapter_pk" PRIMARY KEY("user_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "exercise_state" (
	"user_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	"slug" text NOT NULL,
	"exercise_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct" boolean DEFAULT false NOT NULL,
	CONSTRAINT "exercise_state_user_id_chapter_slug_exercise_id_pk" PRIMARY KEY("user_id","chapter","slug","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_provider_user_id_pk" PRIMARY KEY("provider","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "known_chapters" (
	"user_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	CONSTRAINT "known_chapters_user_id_chapter_pk" PRIMARY KEY("user_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	"slug" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"scroll" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_user_id_chapter_slug_pk" PRIMARY KEY("user_id","chapter","slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"last_chapter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_chapters" ADD CONSTRAINT "completed_chapters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_state" ADD CONSTRAINT "exercise_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_chapters" ADD CONSTRAINT "known_chapters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_dedupe_uq" ON "activity_events" USING btree ("user_id","t","kind","chapter");--> statement-breakpoint
CREATE INDEX "activity_user_t_idx" ON "activity_events" USING btree ("user_id","t");--> statement-breakpoint
CREATE INDEX "identities_user_idx" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_public_uq" ON "sessions" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");