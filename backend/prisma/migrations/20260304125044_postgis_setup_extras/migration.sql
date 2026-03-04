-- ============================================================
-- PostGIS Setup Extras (Prisma SQL Migration)
-- ============================================================
-- Adds what Prisma can't safely manage:
--   - geog auto-compute trigger
--   - backfill + NOT NULL enforcement
--   - spatial index
--   - CHECK constraints
--   - functional indexes
--   - updated_at DB-side triggers + defaults
--
-- Assumes:
--   - PostGIS extension exists (created in init migration)
--   - posts.geog column exists (created in init migration)
-- ============================================================

-- 1) Trigger to auto-compute geog from latitude/longitude
CREATE OR REPLACE FUNCTION posts_update_geog()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.longitude IS NULL OR NEW.latitude IS NULL THEN
    RAISE EXCEPTION 'posts.longitude and posts.latitude must not be NULL';
  END IF;

  IF NEW.latitude < -90 OR NEW.latitude > 90 THEN
    RAISE EXCEPTION 'posts.latitude out of range: %', NEW.latitude;
  END IF;

  IF NEW.longitude < -180 OR NEW.longitude > 180 THEN
    RAISE EXCEPTION 'posts.longitude out of range: %', NEW.longitude;
  END IF;

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

-- 2) Backfill geog, then enforce NOT NULL
UPDATE posts
  SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  WHERE geog IS NULL;

ALTER TABLE posts
  ALTER COLUMN geog SET NOT NULL;

-- 3) GIST Spatial Index on posts.geog
CREATE INDEX IF NOT EXISTS idx_posts_geog
  ON posts USING GIST (geog);

-- 4) Lat/Lng range checks (guarded)
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

-- 5) CHECK constraints for enums (guarded)
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

-- 6) Functional Index for username search
CREATE INDEX IF NOT EXISTS idx_users_username_lower
  ON users ((LOWER(username)) text_pattern_ops);

-- 7) GIN Index on geocode_cache.results_json
CREATE INDEX IF NOT EXISTS idx_geocode_cache_results_json
  ON geocode_cache USING GIN (results_json);

-- 8) Defaults for updated_at (raw SQL inserts safety)
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE posts ALTER COLUMN updated_at SET DEFAULT now();

-- 9) DB trigger for updated_at on UPDATE (DB-side safety)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_posts_set_updated_at ON posts;
CREATE TRIGGER trg_posts_set_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();