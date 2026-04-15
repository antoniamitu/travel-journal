-- backend/prisma/migrations/20260414143500_add_place_category_check/migration.sql

-- Safety normalization before adding the CHECK constraint.
-- This prevents migration failure if any unexpected legacy values somehow exist.
UPDATE "posts"
SET "place_category" = 'other'
WHERE "place_category" IS NULL
   OR "place_category" NOT IN (
     'historical',
     'religious',
     'nature',
     'entertainment',
     'food_drink',
     'shopping',
     'urban_landmark',
     'other'
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_posts_place_category'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "chk_posts_place_category"
      CHECK (
        "place_category" IN (
          'historical',
          'religious',
          'nature',
          'entertainment',
          'food_drink',
          'shopping',
          'urban_landmark',
          'other'
        )
      );
  END IF;
END $$;