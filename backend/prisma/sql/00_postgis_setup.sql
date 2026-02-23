-- ============================================================
-- PostGIS & Custom SQL Migration (fully idempotent)
-- ============================================================
-- Run this AFTER the initial Prisma migration.
-- Safe to run multiple times — statements are IF NOT EXISTS
-- or guarded with DO $$ blocks.
--
-- Handles what Prisma cannot manage natively:
--   1. PostGIS extension
--   2. geom column
--   3. Trigger to auto-compute geom from lat/lng
--   4. Backfill geom + enforce NOT NULL
--   5. GIST spatial index on geom
--   6. CHECK constraints on posts (sentiment, privacy)
--   7. CHECK constraint on geocode_cache (cache_type)
--   8. Functional index on LOWER(username)
--   9. GIN index on geocode_cache.results_json
--  10. DEFAULT now() for updated_at (for raw SQL inserts)
--  11. DB trigger for updated_at on UPDATE (DB-side safety)
-- ============================================================

-- 1) Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 2) Ensure geom column exists on posts
-- ============================================================
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- ============================================================
-- 3) Trigger to auto-compute geom from latitude/longitude
-- ============================================================
CREATE OR REPLACE FUNCTION posts_update_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_update_geom ON posts;

CREATE TRIGGER trg_posts_update_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude
  ON posts
  FOR EACH ROW
  EXECUTE FUNCTION posts_update_geom();

-- ============================================================
-- 4) Backfill geom, then enforce NOT NULL
-- ============================================================
UPDATE posts
  SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  WHERE geom IS NULL;

ALTER TABLE posts
  ALTER COLUMN geom SET NOT NULL;

-- ============================================================
-- 5) GIST Spatial Index on posts.geom
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_geom
  ON posts USING GIST (geom);

-- ============================================================
-- 6) CHECK Constraints (guarded)
-- ============================================================

-- Posts: sentiment must be one of three values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_sentiment'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT chk_posts_sentiment
      CHECK (sentiment IN ('positive', 'neutral', 'negative'));
  END IF;
END $$;

-- Posts: privacy must be one of two values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_privacy'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT chk_posts_privacy
      CHECK (privacy IN ('private', 'public'));
  END IF;
END $$;

-- Geocode cache: cache_type must be forward or reverse
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_geocode_cache_type'
  ) THEN
    ALTER TABLE geocode_cache
      ADD CONSTRAINT chk_geocode_cache_type
      CHECK (cache_type IN ('forward', 'reverse'));
  END IF;
END $$;

-- ============================================================
-- 7) Functional Index for Username Search
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_username_lower
  ON users ((LOWER(username)) text_pattern_ops);

-- ============================================================
-- 8) GIN Index on geocode_cache.results_json
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_geocode_cache_results_json
  ON geocode_cache USING GIN (results_json);

-- ============================================================
-- 10) DEFAULT now() for updated_at (raw SQL inserts)
-- ============================================================
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE posts ALTER COLUMN updated_at SET DEFAULT now();

-- ============================================================
-- 11) DB trigger for updated_at on UPDATE (DB-side safety)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users updated_at trigger
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Posts updated_at trigger
DROP TRIGGER IF EXISTS trg_posts_set_updated_at ON posts;
CREATE TRIGGER trg_posts_set_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();