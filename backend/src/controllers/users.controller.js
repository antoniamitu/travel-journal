// backend/src/controllers/users.controller.js
import { Prisma } from "@prisma/client";
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { cleanupUploads } from "../services/cloudinary.service.js";
import { mapMapFeedRowToApi } from "../mappers/post.mapper.js";
import { countDistinctNormalizedLocationValues } from "../utils/locationText.js";
import { SENTIMENT_VALUES } from "../constants/sentiment.js";

const PROFILE_RECENT_LIMIT = 10;
const PUBLIC_PROFILE_DEFAULT_PAGE = 1;
const PUBLIC_PROFILE_DEFAULT_LIMIT = 20;
const PUBLIC_PROFILE_MAX_LIMIT = 50;
const ALLOWED_SENTIMENTS = new Set(SENTIMENT_VALUES);

const ACCOUNT_SEARCH_MIN_QUERY_LENGTH = 3;
const ACCOUNT_SEARCH_MAX_QUERY_LENGTH = 120;
const ACCOUNT_SEARCH_DEFAULT_LIMIT = 5;
const ACCOUNT_SEARCH_MAX_LIMIT = 10;

const PROFILE_POSTS_SELECT_SQL = Prisma.sql`
  SELECT
    p.id,
    p.user_id,
    u.username,
    p.title,
    CASE
      WHEN char_length(p.content) > 220 THEN left(p.content, 220) || '...'
      ELSE p.content
    END AS content_preview,
    p.location_name,
    p.city,
    p.country,
    p.place_category,
    p.latitude,
    p.longitude,
    p.sentiment,
    p.sentiment_score,
    p.privacy,
    p.created_at,
    COALESCE(img_count.image_count, 0) AS image_count,
    img_first.preview_image,
    COALESCE(img_strip.preview_images, '[]'::json) AS preview_images
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
  ) img_first ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(preview.secure_url ORDER BY preview.display_order ASC, preview.id ASC) AS preview_images
    FROM (
      SELECT pi.id, pi.secure_url, pi.display_order
      FROM post_images pi
      WHERE pi.post_id = p.id
      ORDER BY pi.display_order ASC, pi.id ASC
      LIMIT 3
    ) preview
  ) img_strip ON TRUE
`;

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;

    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function normalizePreviewImages(value) {
  const sanitize = (items) =>
    items.filter((item) => typeof item === "string" && item.trim() !== "");

  if (Array.isArray(value)) {
    return sanitize(value);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? sanitize(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const n =
    typeof value === "object" && typeof value.toString === "function"
      ? Number(value.toString())
      : Number(value);

  return Number.isFinite(n) ? n : null;
}

function mapProfileRecentRowToApi(row, viewerUserId) {
  const base = mapMapFeedRowToApi(row);
  const isOwner = row.user_id === viewerUserId;

  return {
    ...base,
    city: row.city || null,
    country: row.country || null,
    previewImages: normalizePreviewImages(row.preview_images),
    isOwner,
    canEdit: isOwner,
    canDelete: isOwner
  };
}

function buildSentimentCounts(rows) {
  const counts = {
    positive: 0,
    neutral: 0,
    negative: 0
  };

  for (const row of rows || []) {
    const sentiment = typeof row?.sentiment === "string" ? row.sentiment : "";
    const count = Number(row?.count || 0);

    if (Object.prototype.hasOwnProperty.call(counts, sentiment)) {
      counts[sentiment] = count;
    }
  }

  return counts;
}

function mapProfileStats(statsRow, sentimentRows, locationRows) {
  const rows = Array.isArray(locationRows) ? locationRows : [];

  return {
    totalPosts: Number(statsRow?.total_posts || 0),
    publicPosts: Number(statsRow?.public_posts || 0),
    privatePosts: Number(statsRow?.private_posts || 0),
    averageSentimentScore: asNullableNumber(statsRow?.average_sentiment_score),
    sentimentCounts: buildSentimentCounts(sentimentRows),
    countriesVisited: countDistinctNormalizedLocationValues(rows.map((row) => row.country)),
    citiesVisited: countDistinctNormalizedLocationValues(rows.map((row) => row.city))
  };
}

function normalizeRequestedUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountSearchQueryValue(value) {
  let q = typeof value === "string" ? value.trim() : "";
  if (q.startsWith("@")) {
    q = q.slice(1).trimStart();
  }
  return q;
}

function escapeLikePattern(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function parseBoundedPositiveIntegerOrThrow(rawValue, { defaultValue, minValue, maxValue }) {
  if (rawValue == null || String(rawValue).trim() === "") {
    return defaultValue;
  }

  const raw = String(rawValue).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new HttpError(400, "Invalid pagination parameters");
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new HttpError(400, "Invalid pagination parameters");
  }

  return Math.min(maxValue, Math.max(minValue, parsed));
}

function parsePublicProfileQuery(query) {
  const page = parseBoundedPositiveIntegerOrThrow(query?.page, {
    defaultValue: PUBLIC_PROFILE_DEFAULT_PAGE,
    minValue: 1,
    maxValue: Number.MAX_SAFE_INTEGER
  });

  const limit = parseBoundedPositiveIntegerOrThrow(query?.limit, {
    defaultValue: PUBLIC_PROFILE_DEFAULT_LIMIT,
    minValue: 1,
    maxValue: PUBLIC_PROFILE_MAX_LIMIT
  });

  let sentiment;

  if (query?.sentiment != null && String(query.sentiment).trim() !== "") {
    const normalized = String(query.sentiment).trim().toLowerCase();

    if (!ALLOWED_SENTIMENTS.has(normalized)) {
      throw new HttpError(400, "Validation failed", {
        sentiment: "sentiment must be one of: positive, neutral, negative"
      });
    }

    sentiment = normalized;
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError(400, "Invalid pagination parameters");
  }

  return {
    page,
    limit,
    offset,
    sentiment
  };
}

function parseAccountSearchQuery(query) {
  const errors = {};
  const q = normalizeAccountSearchQueryValue(query?.q);
  let limit = ACCOUNT_SEARCH_DEFAULT_LIMIT;

  if (!q) {
    errors.q = "q is required";
  } else if (q.length < ACCOUNT_SEARCH_MIN_QUERY_LENGTH) {
    errors.q = `q must be at least ${ACCOUNT_SEARCH_MIN_QUERY_LENGTH} characters`;
  } else if (q.length > ACCOUNT_SEARCH_MAX_QUERY_LENGTH) {
    errors.q = `q must be at most ${ACCOUNT_SEARCH_MAX_QUERY_LENGTH} characters`;
  }

  if (query?.limit != null && String(query.limit).trim() !== "") {
    const rawLimit = String(query.limit).trim();

    if (!/^[1-9]\d*$/.test(rawLimit)) {
      errors.limit = "limit must be a positive integer";
    } else {
      const parsedLimit = Number(rawLimit);

      if (!Number.isSafeInteger(parsedLimit)) {
        errors.limit = "limit is too large";
      } else if (parsedLimit > ACCOUNT_SEARCH_MAX_LIMIT) {
        errors.limit = `limit must be between 1 and ${ACCOUNT_SEARCH_MAX_LIMIT}`;
      } else {
        limit = parsedLimit;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, "Validation failed", errors);
  }

  return { q, limit };
}

function buildVisiblePostsWhere(targetUserId, viewerUserId, sentiment) {
  const where = {
    user_id: targetUserId,
    ...(targetUserId === viewerUserId ? {} : { privacy: "public" })
  };

  if (sentiment) {
    where.sentiment = sentiment;
  }

  return where;
}

async function getAuthenticatedUserOrThrow(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      created_at: true
    }
  });

  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  return user;
}

export async function getProfile(req, res) {
  const prisma = getPrisma();
  const userId = req.userId;

  const user = await getAuthenticatedUserOrThrow(prisma, userId);

  const [statsRows, sentimentRows, locationRows, recentRows] = await prisma.$transaction([
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          COUNT(*)::int AS total_posts,
          COUNT(*) FILTER (WHERE privacy = 'public')::int AS public_posts,
          COUNT(*) FILTER (WHERE privacy = 'private')::int AS private_posts,
          ROUND(AVG(sentiment_score), 2) AS average_sentiment_score
        FROM posts
        WHERE user_id = ${userId}
      `
    ),
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          sentiment,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
        GROUP BY sentiment
      `
    ),
    prisma.post.findMany({
      where: {
        user_id: userId
      },
      select: {
        city: true,
        country: true
      }
    }),
    prisma.$queryRaw(
      Prisma.sql`
        ${PROFILE_POSTS_SELECT_SQL}
        WHERE p.user_id = ${userId}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${PROFILE_RECENT_LIMIT}
      `
    )
  ]);

  const stats = mapProfileStats(statsRows?.[0], sentimentRows, locationRows);
  const recentPosts = (recentRows || []).map((row) => mapProfileRecentRowToApi(row, userId));

  return res.status(200).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.created_at
    },
    stats,
    recentPosts
  });
}

export async function searchAccounts(req, res) {
  const prisma = getPrisma();
  const { q, limit } = parseAccountSearchQuery(req.query);
  const escapedQ = escapeLikePattern(q);

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT
        u.username
      FROM users u
      WHERE LOWER(u.username) LIKE LOWER(${escapedQ}) || '%' ESCAPE '\\'
      ORDER BY LOWER(u.username) ASC, u.id ASC
      LIMIT ${limit}
    `
  );

  const accounts = (rows || []).map((row) => {
    const username = String(row?.username || "").trim();

    return {
      username,
      label: `@${username}`
    };
  });

  return res.status(200).json({ accounts });
}

export async function getUserProfileByUsername(req, res) {
  const prisma = getPrisma();
  const viewerUserId = req.userId;
  const requestedUsername = normalizeRequestedUsername(req.params?.username);

  if (!requestedUsername) {
    throw new HttpError(400, "Validation failed", {
      username: "username is required"
    });
  }

  const { page, limit, offset, sentiment } = parsePublicProfileQuery(req.query);

  const targetUser = await prisma.user.findFirst({
    where: {
      username: {
        equals: requestedUsername,
        mode: "insensitive"
      }
    },
    select: {
      id: true,
      username: true,
      created_at: true
    }
  });

  if (!targetUser) {
    throw new HttpError(404, "Not found");
  }

  const filteredWhere = buildVisiblePostsWhere(targetUser.id, viewerUserId, sentiment);
  const visibleWhere = buildVisiblePostsWhere(targetUser.id, viewerUserId);
  const visibilitySql =
    targetUser.id === viewerUserId ? Prisma.empty : Prisma.sql` AND p.privacy = 'public'`;
  const sentimentSql = sentiment ? Prisma.sql` AND p.sentiment = ${sentiment}` : Prisma.empty;

  const [total, postRows, statsRows, sentimentRows, locationRows] = await prisma.$transaction([
    prisma.post.count({ where: filteredWhere }),
    prisma.$queryRaw(
      Prisma.sql`
        ${PROFILE_POSTS_SELECT_SQL}
        WHERE p.user_id = ${targetUser.id}
        ${visibilitySql}
        ${sentimentSql}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    ),
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          COUNT(*)::int AS total_posts,
          COUNT(*) FILTER (WHERE privacy = 'public')::int AS public_posts,
          COUNT(*) FILTER (WHERE privacy = 'private')::int AS private_posts,
          ROUND(AVG(sentiment_score), 2) AS average_sentiment_score
        FROM posts
        WHERE user_id = ${targetUser.id}
        ${targetUser.id === viewerUserId ? Prisma.empty : Prisma.sql` AND privacy = 'public'`}
      `
    ),
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          sentiment,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${targetUser.id}
        ${targetUser.id === viewerUserId ? Prisma.empty : Prisma.sql` AND privacy = 'public'`}
        GROUP BY sentiment
      `
    ),
    prisma.post.findMany({
      where: visibleWhere,
      select: {
        city: true,
        country: true
      }
    })
  ]);

  const posts = (postRows || []).map((row) => mapProfileRecentRowToApi(row, viewerUserId));
  const stats = mapProfileStats(statsRows?.[0], sentimentRows, locationRows);

  return res.status(200).json({
    user: {
      username: targetUser.username,
      createdAt: targetUser.created_at
    },
    stats,
    posts,
    total
  });
}

export async function deleteProfile(req, res) {
  const prisma = getPrisma();
  const userId = req.userId;

  await getAuthenticatedUserOrThrow(prisma, userId);

  const posts = await prisma.post.findMany({
    where: {
      user_id: userId
    },
    select: {
      id: true,
      images: {
        select: {
          public_id: true
        }
      }
    }
  });

  const publicIds = uniqueStrings(
    posts.flatMap((post) => post.images.map((image) => image.public_id))
  );

  try {
    await prisma.user.delete({
      where: {
        id: userId
      }
    });
  } catch (err) {
    if (err?.code === "P2025") {
      throw new HttpError(401, "Unauthorized");
    }

    throw err;
  }

  let cleanupResult = {
    deleted: [],
    failed: publicIds.slice()
  };

  if (publicIds.length > 0) {
    try {
      cleanupResult = await cleanupUploads(userId, publicIds, { invalidate: true });
    } catch (err) {
      console.error("Account delete Cloudinary cleanup crashed", {
        userId,
        postCount: posts.length,
        imageCount: publicIds.length,
        error: err?.message || String(err)
      });
    }
  }

  if (cleanupResult.failed.length > 0) {
    console.warn("Account delete Cloudinary cleanup had partial failures", {
      userId,
      postCount: posts.length,
      failedCount: cleanupResult.failed.length,
      failedPublicIds: cleanupResult.failed
    });
  }

  return res.status(200).json({
    message: "Account deleted"
  });
}