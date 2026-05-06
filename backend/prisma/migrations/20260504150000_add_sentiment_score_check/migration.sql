-- backend/prisma/migrations/20260504150000_add_sentiment_score_check/migration.sql

-- Sentiment scores are defined by the application on a 0-10 scale.
-- This CHECK constraint adds DB-level defense-in-depth for direct SQL writes
-- or unexpected application bugs.
--
-- NULL remains allowed because older posts or skipped analyses may not have
-- a stored score.

UPDATE "posts"
SET "sentiment_score" = NULL
WHERE "sentiment_score" IS NOT NULL
  AND ("sentiment_score" < 0 OR "sentiment_score" > 10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_posts_sentiment_score'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "chk_posts_sentiment_score"
      CHECK (
        "sentiment_score" IS NULL
        OR ("sentiment_score" >= 0 AND "sentiment_score" <= 10)
      );
  END IF;
END $$;