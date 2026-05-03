// frontend/src/api/dashboard.js
import { api } from "./axios.js";

const EMPTY_DASHBOARD = {
  summary: {
    totalPosts: 0,
    memberSince: null
  },
  activityTimeline: [],
  sentimentBreakdown: [
    { sentiment: "positive", label: "Positive", count: 0 },
    { sentiment: "neutral", label: "Neutral", count: 0 },
    { sentiment: "negative", label: "Negative", count: 0 }
  ],
  categoryBreakdown: [],
  topCountries: [],
  topCities: [],
  photoVerification: {
    match: 0,
    uncertain: 0,
    skipped: 0,
    mismatch: 0
  },
  postingGap: null
};

function asSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSummary(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    totalPosts: asSafeNumber(source.totalPosts, 0),
    memberSince: typeof source.memberSince === "string" ? source.memberSince : null
  };
}

function normalizeActivityTimeline(value) {
  return normalizeArray(value)
    .map((item) => {
      const month = String(item?.month || "").trim();
      const label = String(item?.label || month || "Unknown").trim();

      if (!month && !label) return null;

      return {
        month,
        label,
        count: asSafeNumber(item?.count, 0)
      };
    })
    .filter(Boolean);
}

function normalizeSentimentBreakdown(value) {
  const source = normalizeArray(value);
  const byKey = new Map();

  for (const item of source) {
    const sentiment = String(item?.sentiment || "").trim().toLowerCase();

    if (!["positive", "neutral", "negative"].includes(sentiment)) {
      continue;
    }

    const current = byKey.get(sentiment);
    const count = asSafeNumber(item?.count, 0);

    byKey.set(sentiment, {
      sentiment,
      label: String(item?.label || current?.label || sentiment).trim(),
      count: asSafeNumber(current?.count, 0) + count
    });
  }

  return EMPTY_DASHBOARD.sentimentBreakdown.map((fallback) => ({
    ...fallback,
    ...(byKey.get(fallback.sentiment) || {})
  }));
}

function normalizeCategoryBreakdown(value) {
  return normalizeArray(value)
    .map((item) => {
      const category = String(item?.category || "other").trim().toLowerCase();
      const label = String(item?.label || category).trim();
      const count = asSafeNumber(item?.count, 0);

      if (count <= 0) return null;

      return {
        category,
        label,
        count
      };
    })
    .filter(Boolean);
}

function normalizeRankedLocations(value, key) {
  return normalizeArray(value)
    .map((item) => {
      const label = String(item?.[key] || "").trim();
      const count = asSafeNumber(item?.count, 0);

      if (!label || count <= 0) return null;

      return {
        [key]: label,
        count
      };
    })
    .filter(Boolean);
}

function normalizePhotoVerification(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    match: asSafeNumber(source.match, 0),
    uncertain: asSafeNumber(source.uncertain, 0),
    skipped: asSafeNumber(source.skipped, 0),
    mismatch: asSafeNumber(source.mismatch, 0)
  };
}

function normalizePostingGap(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const longestGapDays = asSafeNumber(value.longestGapDays, 0);
  const from = typeof value.from === "string" ? value.from : null;
  const to = typeof value.to === "string" ? value.to : null;

  if (longestGapDays < 1 || !from || !to) {
    return null;
  }

  return {
    longestGapDays,
    from,
    to
  };
}

function normalizeDashboard(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    summary: normalizeSummary(source.summary),
    activityTimeline: normalizeActivityTimeline(source.activityTimeline),
    sentimentBreakdown: normalizeSentimentBreakdown(source.sentimentBreakdown),
    categoryBreakdown: normalizeCategoryBreakdown(source.categoryBreakdown),
    topCountries: normalizeRankedLocations(source.topCountries, "country"),
    topCities: normalizeRankedLocations(source.topCities, "city"),
    photoVerification: normalizePhotoVerification(source.photoVerification),
    postingGap: normalizePostingGap(source.postingGap)
  };
}

export async function getMyDashboard(options = {}) {
  const res = await api.get("/dashboard/me", options);
  return normalizeDashboard(res?.data);
}