-- backend/prisma/migrations/20260420120000_add_photo_verification_columns/migration.sql

CREATE TYPE "PhotoVerificationStatus" AS ENUM ('match', 'uncertain', 'mismatch');

ALTER TABLE "posts"
ADD COLUMN "photo_verification_status" "PhotoVerificationStatus",
ADD COLUMN "photo_verification_checked_at" TIMESTAMPTZ,
ADD COLUMN "photo_verification_confidence" DOUBLE PRECISION,
ADD COLUMN "photo_verification_distance_meters" INTEGER,
ADD COLUMN "photo_verification_detected_name" VARCHAR(255),
ADD COLUMN "photo_verification_reasons" JSONB,
ADD COLUMN "photo_verification_provider" VARCHAR(50);

CREATE INDEX "posts_photo_verification_status_idx"
  ON "posts" ("photo_verification_status");