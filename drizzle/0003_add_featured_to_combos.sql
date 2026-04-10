ALTER TABLE "combos"
ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;

CREATE INDEX "combos_featured_created_at_idx"
ON "combos" ("is_featured","created_at");
