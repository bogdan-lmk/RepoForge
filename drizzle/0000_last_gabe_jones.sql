CREATE TABLE "combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"thesis" text NOT NULL,
	"formula" text,
	"repo_slugs" jsonb DEFAULT '[]'::jsonb,
	"repo_roles" jsonb DEFAULT '{}'::jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"recommended_shell" text DEFAULT 'web',
	"what_is_being_combined" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"supporting_primitives" jsonb DEFAULT '[]'::jsonb,
	"why_fit" text,
	"use_case" text,
	"why_better_than_single" text,
	"first_user" text,
	"demo_72h" text,
	"key_risks" jsonb DEFAULT '[]'::jsonb,
	"scores" jsonb DEFAULT '{}'::jsonb,
	"query_text" text,
	"saved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"readme" text,
	"language" text,
	"topics" jsonb DEFAULT '[]'::jsonb,
	"stars" integer DEFAULT 0,
	"stars_delta_30d" integer DEFAULT 0,
	"trend_score" numeric,
	"source_rank" integer DEFAULT 0,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"primitives" jsonb DEFAULT '[]'::jsonb,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "scan_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"repos_found" integer DEFAULT 0,
	"repos_enriched" integer DEFAULT 0,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "combos_query_title_idx" ON "combos" USING btree ("query_text","title");--> statement-breakpoint
CREATE INDEX "repos_language_idx" ON "repos" USING btree ("language");