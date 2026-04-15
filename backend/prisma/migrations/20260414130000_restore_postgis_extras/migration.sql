-- backend/prisma/migrations/20260414130000_restore_postgis_extras/migration.sql

-- Restore DB-side defaults removed by Prisma diff
ALTER TABLE "users"
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "posts"
  ALTER COLUMN "updated_at" SET DEFAULT now();

-- Safety backfill (just in case)
UPDATE "posts"
SET "geog" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "geog" IS NULL;

-- Restore NOT NULL constraint on geog
ALTER TABLE "posts"
  ALTER COLUMN "geog" SET NOT NULL;

-- Restore PostGIS spatial index
CREATE INDEX IF NOT EXISTS "idx_posts_geog"
  ON "posts" USING GIST ("geog");

-- Restore GIN index for cache JSON
CREATE INDEX IF NOT EXISTS "idx_geocode_cache_results_json"
  ON "geocode_cache" USING GIN ("results_json");