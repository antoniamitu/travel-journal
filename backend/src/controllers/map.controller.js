// backend/src/controllers/map.controller.js
import { Prisma } from "@prisma/client";
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { mapPostsQuerySchema } from "../validators/map.validator.js";
import { mapMapFeedRowToApi } from "../mappers/post.mapper.js";

const MAX_MAP_POSTS = 500;
const WORLD_LONGITUDE_EPSILON = 1e-9;

const MAP_POSTS_SELECT_SQL = Prisma.sql`
  SELECT
    p.id,
    p.user_id,
    u.username,
    p.title,
    CASE
      WHEN char_length(p.content) > 150 THEN left(p.content, 150) || '...'
      ELSE p.content
    END AS content_preview,
    p.location_name,
    p.latitude,
    p.longitude,
    p.sentiment,
    p.privacy,
    p.created_at,
    COALESCE(img_count.image_count, 0) AS image_count,
    img_preview.preview_image
  FROM posts p
  INNER JOIN users u
    ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS image_count
    FROM post_images pi
    WHERE pi.post_id = p.id
  ) img_count ON TRUE
  LEFT JOIN LATERAL (
    SELECT pi.secure_url AS preview_image
    FROM post_images pi
    WHERE pi.post_id = p.id
    ORDER BY pi.display_order ASC, pi.id ASC
    LIMIT 1
  ) img_preview ON TRUE
`;

const MAP_POSTS_ORDER_LIMIT_SQL = Prisma.sql`
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT ${MAX_MAP_POSTS}
`;

function coversAllLongitudes(westLng, eastLng) {
  return westLng <= -180 + WORLD_LONGITUDE_EPSILON && eastLng >= 180 - WORLD_LONGITUDE_EPSILON;
}

async function queryPostsWithSpatialBounds(prisma, userId, northLat, southLat, eastLng, westLng) {
  return prisma.$queryRaw(
    Prisma.sql`
      ${MAP_POSTS_SELECT_SQL}
      WHERE
        (p.user_id = ${userId} OR p.privacy = 'public')
        -- Expected to use the GIST spatial index on posts.geog (idx_posts_geog / equivalent migration index).
        AND ST_Intersects(
          p.geog,
          ST_MakeEnvelope(${westLng}, ${southLat}, ${eastLng}, ${northLat}, 4326)::geography
        )
      ${MAP_POSTS_ORDER_LIMIT_SQL}
    `
  );
}

async function queryPostsWithFullLongitudeBand(prisma, userId, northLat, southLat) {
  return prisma.$queryRaw(
    Prisma.sql`
      ${MAP_POSTS_SELECT_SQL}
      WHERE
        (p.user_id = ${userId} OR p.privacy = 'public')
        -- Full-world longitude span (-180..180) can trigger an antipodal geography error.
        -- In that case, longitude filtering is unnecessary anyway, so we safely filter only by latitude.
        AND p.latitude >= ${southLat}
        AND p.latitude <= ${northLat}
      ${MAP_POSTS_ORDER_LIMIT_SQL}
    `
  );
}

export async function getPostsInBounds(req, res) {
  const parsed = mapPostsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const prisma = getPrisma();
  const userId = req.userId;
  const { northLat, southLat, eastLng, westLng } = parsed.data;

  const useFullLongitudeBandFallback = coversAllLongitudes(westLng, eastLng);

  let rows;
  if (useFullLongitudeBandFallback) {
    rows = await queryPostsWithFullLongitudeBand(prisma, userId, northLat, southLat);
  } else {
    rows = await queryPostsWithSpatialBounds(prisma, userId, northLat, southLat, eastLng, westLng);
  }

  const posts = rows.map(mapMapFeedRowToApi);

  return res.status(200).json({
    ok: true,
    posts,
    countInBounds: posts.length
  });
}