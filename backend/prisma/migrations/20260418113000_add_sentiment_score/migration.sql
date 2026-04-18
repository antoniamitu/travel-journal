-- backend/prisma/migrations/20260418_add_sentiment_score/migration.sql
ALTER TABLE "posts"
ADD COLUMN "sentiment_score" DECIMAL(4,2);