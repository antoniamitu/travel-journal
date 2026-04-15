-- DropIndex
DROP INDEX "idx_geocode_cache_results_json";

-- DropIndex
DROP INDEX "idx_posts_geog";

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "address_type" VARCHAR(50),
ADD COLUMN     "osm_class" VARCHAR(50),
ADD COLUMN     "osm_subtype" VARCHAR(100),
ADD COLUMN     "place_category" VARCHAR(30) NOT NULL DEFAULT 'other',
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "geog" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "posts_place_category_idx" ON "posts"("place_category");
