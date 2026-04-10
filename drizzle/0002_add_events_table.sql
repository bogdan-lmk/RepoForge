CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"query_text" text,
	"repo_slug" text,
	"combo_id" integer,
	"page" text,
	"source" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_event_type_created_at_idx" ON "events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "events_session_id_created_at_idx" ON "events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "events_combo_id_idx" ON "events" USING btree ("combo_id");--> statement-breakpoint
CREATE INDEX "events_repo_slug_idx" ON "events" USING btree ("repo_slug");--> statement-breakpoint
