-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location_name" VARCHAR(500) NOT NULL,
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "sentiment" VARCHAR(20) NOT NULL,
    "privacy" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "geom" geometry(Point, 4326),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_images" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "secure_url" VARCHAR(500) NOT NULL,
    "public_id" VARCHAR(200) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_cache" (
    "id" SERIAL NOT NULL,
    "cache_key" VARCHAR(500) NOT NULL,
    "cache_type" VARCHAR(20) NOT NULL,
    "results_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_content_cache" (
    "id" SERIAL NOT NULL,
    "location_key" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_content_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "posts_user_id_idx" ON "posts"("user_id");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_images_public_id_key" ON "post_images"("public_id");

-- CreateIndex
CREATE INDEX "post_images_post_id_idx" ON "post_images"("post_id");

-- CreateIndex
CREATE INDEX "geocode_cache_cache_key_cache_type_created_at_idx" ON "geocode_cache"("cache_key", "cache_type", "created_at");

-- CreateIndex
CREATE INDEX "geocode_cache_created_at_idx" ON "geocode_cache"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_cache_key_cache_type_key" ON "geocode_cache"("cache_key", "cache_type");

-- CreateIndex
CREATE UNIQUE INDEX "ai_content_cache_location_key_key" ON "ai_content_cache"("location_key");

-- CreateIndex
CREATE INDEX "ai_content_cache_created_at_idx" ON "ai_content_cache"("created_at");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
