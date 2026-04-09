-- Full-Text Search: add weighted tsvector generated column + GIN index
-- Weights: A = slug+name, B = description, C = readme (first 4000 chars),
--          D = topics + capabilities (jsonb string[] → text)

ALTER TABLE "repos"
  ADD COLUMN "fts" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("slug", '') || ' ' || coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce("readme", ''), 4000)), 'C') ||
    setweight(to_tsvector('english', regexp_replace(coalesce("topics"::text, ''), '["\[\]{}]', ' ', 'g') || ' ' || regexp_replace(coalesce("capabilities"::text, ''), '["\[\]{}]', ' ', 'g')), 'D')
  ) STORED;
--> statement-breakpoint
CREATE INDEX "repos_fts_idx" ON "repos" USING gin ("fts");
