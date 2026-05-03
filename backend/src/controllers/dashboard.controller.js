// backend/src/controllers/dashboard.controller.js
import { Prisma } from "@prisma/client";
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import {
  normalizeLocationCompareKey,
  normalizeLocationDisplayText
} from "../utils/locationText.js";

const PLACE_CATEGORY_LABELS = {
  historical: "Historical",
  religious: "Religious",
  nature: "Nature",
  entertainment: "Entertainment",
  food_drink: "Food & Drink",
  shopping: "Shopping",
  urban_landmark: "Urban Landmark",
  other: "Other"
};

const SENTIMENT_LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative"
};

const KNOWN_PLACE_CATEGORIES = new Set(Object.keys(PLACE_CATEGORY_LABELS));
const KNOWN_SENTIMENTS = new Set(Object.keys(SENTIMENT_LABELS));

function normalizePlaceCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_PLACE_CATEGORIES.has(normalized) ? normalized : "other";
}

function normalizeSentiment(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_SENTIMENTS.has(normalized) ? normalized : "neutral";
}

function asSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function monthLabelFromKey(monthKey) {
  const safeMonth = String(monthKey || "").trim();

  if (!/^\d{4}-\d{2}$/.test(safeMonth)) {
    return safeMonth || "Unknown month";
  }

  const [year, month] = safeMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));

  if (Number.isNaN(date.getTime())) {
    return safeMonth;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function normalizeActivityTimeline(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const month = String(row?.month || "").trim();

    return {
      month,
      label: monthLabelFromKey(month),
      count: asSafeNumber(row?.count)
    };
  });
}

function normalizeSentimentBreakdown(rows) {
  const counts = {
    positive: 0,
    neutral: 0,
    negative: 0
  };

  for (const row of rows || []) {
    const sentiment = normalizeSentiment(row?.sentiment);
    counts[sentiment] += asSafeNumber(row?.count);
  }

  return Object.keys(SENTIMENT_LABELS).map((sentiment) => ({
    sentiment,
    label: SENTIMENT_LABELS[sentiment],
    count: counts[sentiment]
  }));
}

function normalizeCategoryBreakdown(rows) {
  const counts = new Map();

  for (const row of rows || []) {
    const category = normalizePlaceCategory(row?.category);
    const count = asSafeNumber(row?.count);

    if (count <= 0) {
      continue;
    }

    counts.set(category, (counts.get(category) || 0) + count);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      label: PLACE_CATEGORY_LABELS[category],
      count
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
}

function normalizeRankedLocationRows(rows, key, limit = 5) {
  const grouped = new Map();

  for (const row of rows || []) {
    const label = normalizeLocationDisplayText(row?.[key]);
    const compareKey = normalizeLocationCompareKey(label);
    const count = asSafeNumber(row?.count);

    if (!label || !compareKey || count <= 0) {
      continue;
    }

    const current = grouped.get(compareKey);

    if (!current) {
      grouped.set(compareKey, {
        label,
        count,
        strongestSingleCount: count
      });
      continue;
    }

    current.count += count;

    // Keep the display label that represents the strongest individual spelling.
    // Example: Romania + România are grouped, and the most common spelling is shown.
    if (count > current.strongestSingleCount) {
      current.label = label;
      current.strongestSingleCount = count;
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      [key]: item.label,
      count: item.count
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(a[key]).localeCompare(String(b[key]));
    })
    .slice(0, limit);
}

function normalizePhotoVerification(rows) {
  const out = {
    match: 0,
    uncertain: 0,
    skipped: 0,
    mismatch: 0
  };

  for (const row of rows || []) {
    const status = String(row?.status || "").trim().toLowerCase();
    const count = asSafeNumber(row?.count);

    if (Object.prototype.hasOwnProperty.call(out, status)) {
      out[status] += count;
    }
  }

  return out;
}

function normalizePostingGap(row) {
  if (!row?.from || !row?.to) {
    return null;
  }

  const longestGapDays = asSafeNumber(row?.longest_gap_days, 0);

  // Only meaningful breaks are exposed.
  // Gaps under 24 hours are intentionally filtered out in SQL.
  if (longestGapDays < 1) {
    return null;
  }

  return {
    longestGapDays,
    from: row.from,
    to: row.to
  };
}

export async function getMyDashboard(req, res) {
  const prisma = getPrisma();
  const userId = req.userId;

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      created_at: true
    }
  });

  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  const [
    totalRows,
    activityRows,
    sentimentRows,
    categoryRows,
    topCountryRows,
    topCityRows,
    photoRows,
    postingGapRows
  ] = await prisma.$transaction([
    prisma.$queryRaw(
      Prisma.sql`
        SELECT COUNT(*)::int AS total_posts
        FROM posts
        WHERE user_id = ${userId}
      `
    ),

    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
        GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'UTC')
        ORDER BY DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') ASC
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

    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          place_category AS category,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
        GROUP BY place_category
      `
    ),

    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          BTRIM(country) AS country,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
          AND country IS NOT NULL
          AND BTRIM(country) <> ''
        GROUP BY BTRIM(country)
        ORDER BY COUNT(*) DESC, BTRIM(country) ASC
      `
    ),

    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          BTRIM(city) AS city,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
          AND city IS NOT NULL
          AND BTRIM(city) <> ''
        GROUP BY BTRIM(city)
        ORDER BY COUNT(*) DESC, BTRIM(city) ASC
      `
    ),

    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          COALESCE(photo_verification_status::text, 'skipped') AS status,
          COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
        GROUP BY COALESCE(photo_verification_status::text, 'skipped')
      `
    ),

    prisma.$queryRaw(
      Prisma.sql`
        WITH ordered_posts AS (
          SELECT
            id,
            created_at,
            LAG(created_at) OVER (ORDER BY created_at ASC, id ASC) AS previous_created_at
          FROM posts
          WHERE user_id = ${userId}
        ),
        gaps AS (
          SELECT
            previous_created_at AS "from",
            created_at AS "to",
            EXTRACT(EPOCH FROM (created_at - previous_created_at)) / 86400 AS gap_days
          FROM ordered_posts
          WHERE previous_created_at IS NOT NULL
        )
        SELECT
          "from",
          "to",
          FLOOR(gap_days)::int AS longest_gap_days
        FROM gaps
        WHERE gap_days >= 1
        ORDER BY gap_days DESC, "to" DESC
        LIMIT 1
      `
    )
  ]);

  return res.status(200).json({
    summary: {
      totalPosts: asSafeNumber(totalRows?.[0]?.total_posts),
      memberSince: user.created_at
    },
    activityTimeline: normalizeActivityTimeline(activityRows),
    sentimentBreakdown: normalizeSentimentBreakdown(sentimentRows),
    categoryBreakdown: normalizeCategoryBreakdown(categoryRows),
    topCountries: normalizeRankedLocationRows(topCountryRows, "country"),
    topCities: normalizeRankedLocationRows(topCityRows, "city"),
    photoVerification: normalizePhotoVerification(photoRows),
    postingGap: normalizePostingGap(postingGapRows?.[0])
  });
}