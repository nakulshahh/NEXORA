CREATE TABLE "card_reviews" (
	"user_id" uuid NOT NULL,
	"chapter" text NOT NULL,
	"slug" text NOT NULL,
	"exercise_id" text NOT NULL,
	"ease_x100" integer NOT NULL,
	"interval_days" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"due" bigint NOT NULL,
	"last" bigint NOT NULL,
	"first" boolean NOT NULL,
	CONSTRAINT "card_reviews_user_id_chapter_slug_exercise_id_pk" PRIMARY KEY("user_id","chapter","slug","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;