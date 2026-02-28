-- backend/prisma/sql/00_postgis_setup.sql
-- ============================================================
-- PostGIS & Custom SQL Migration (fully idempotent)
-- ============================================================
-- Run this AFTER the initial Prisma migration.
-- Safe to run multiple times — statements are IF NOT EXISTS
-- or guarded with DO $$ blocks.
--
-- Handles what Prisma cannot manage natively:
--   1. PostGIS extension
--   2. geog column (geography(Point, 4326))
--   3. Trigger to auto-compute geog from lat/lng
--   4. Backfill geog + enforce NOT NULL
--   5. GIST spatial index on geog
--   6. CHECK constraints on posts (sentiment, privacy)
--   7. CHECK constraint on geocode_cache (cache_type)
--   8. Functional index on LOWER(username)
--   9. GIN index on geocode_cache.results_json
--  10. DEFAULT now() for updated_at (for raw SQL inserts)
--  11. DB trigger for updated_at on UPDATE (DB-side safety)
--  12. (Extra safety) lat/lng range checks
-- ============================================================

-- 1) Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 2) Ensure geog column exists on posts (geography)
-- ============================================================
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);

-- ============================================================
-- 3) Trigger to auto-compute geog from latitude/longitude (bulletproof)
-- ============================================================
CREATE OR REPLACE FUNCTION posts_update_geog()
RETURNS TRIGGER AS $$
BEGIN
  -- Fail fast: prevents silent bad data and prevents NOT NULL issues later.
  IF NEW.longitude IS NULL OR NEW.latitude IS NULL THEN
    RAISE EXCEPTION 'posts.longitude and posts.latitude must not be NULL';
  END IF;

  -- Extra strictness: ensure valid ranges
  IF NEW.latitude < -90 OR NEW.latitude > 90 THEN
    RAISE EXCEPTION 'posts.latitude out of range: %', NEW.latitude;
  END IF;

  IF NEW.longitude < -180 OR NEW.longitude > 180 THEN
    RAISE EXCEPTION 'posts.longitude out of range: %', NEW.longitude;
  END IF;

  -- PostGIS uses (longitude, latitude) order
  NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_update_geog ON posts;

CREATE TRIGGER trg_posts_update_geog
  BEFORE INSERT OR UPDATE OF latitude, longitude
  ON posts
  FOR EACH ROW
  EXECUTE FUNCTION posts_update_geog();

-- ============================================================
-- 4) Backfill geog, then enforce NOT NULL
-- ============================================================
UPDATE posts
  SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  WHERE geog IS NULL;

ALTER TABLE posts
  ALTER COLUMN geog SET NOT NULL;

-- ============================================================
-- 5) GIST Spatial Index on posts.geog
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_geog
  ON posts USING GIST (geog);

-- ============================================================
-- 12) lat/lng range checks (guarded)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_latitude_range'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT chk_posts_latitude_range
      CHECK (latitude >= -90 AND latitude <= 90);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_longitude_range'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT chk_posts_longitude_range
      CHECK (longitude >= -180 AND longitude <= 180);
  END IF;
END $$;

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