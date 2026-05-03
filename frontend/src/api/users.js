// frontend/src/api/users.js
import { api } from "./axios.js";

const EMPTY_SENTIMENT_COUNTS = {
  positive: 0,
  neutral: 0,
  negative: 0
};

const EMPTY_STATS = {
  totalPosts: 0,
  publicPosts: 0,
  privatePosts: 0,
  averageSentimentScore: null,
  sentimentCounts: EMPTY_SENTIMENT_COUNTS,
  countriesVisited: 0,
  citiesVisited: 0
};

function asSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSentimentCounts(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    positive: asSafeNumber(source.positive, 0),
    neutral: asSafeNumber(source.neutral, 0),
    negative: asSafeNumber(source.negative, 0)
  };
}

function normalizeStats(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    totalPosts: asSafeNumber(source.totalPosts, EMPTY_STATS.totalPosts),
    publicPosts: asSafeNumber(source.publicPosts, EMPTY_STATS.publicPosts),
    privatePosts: asSafeNumber(source.privatePosts, EMPTY_STATS.privatePosts),
    averageSentimentScore: asNullableNumber(source.averageSentimentScore),
    sentimentCounts: normalizeSentimentCounts(source.sentimentCounts),
    countriesVisited: asSafeNumber(source.countriesVisited, EMPTY_STATS.countriesVisited),
    citiesVisited: asSafeNumber(source.citiesVisited, EMPTY_STATS.citiesVisited)
  };
}

function normalizePosts(value) {
  return Array.isArray(value) ? value.filter((post) => post && post.id != null) : [];
}

function normalizeAccountSuggestions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const username = String(item?.username || "").trim();
      const label = String(item?.label || (username ? `@${username}` : "")).trim();

      if (!username || !label) {
        return null;
      }

      return { username, label };
    })
    .filter(Boolean);
}

export async function getOwnProfile(options = {}) {
  const res = await api.get("/users/profile", options);
  const data = res?.data ?? {};

  return {
    user: data?.user ?? null,
    stats: normalizeStats(data?.stats),
    posts: normalizePosts(data?.posts),
    recentPosts: normalizePosts(data?.recentPosts),
    mapPosts: normalizePosts(data?.mapPosts)
  };
}

export async function searchAccounts(query, params = {}, options = {}) {
  const safeQuery = String(query || "").trim();

  const res = await api.get("/users/search", {
    ...options,
    params: {
      q: safeQuery,
      ...(params || {}),
      ...(options?.params || {})
    }
  });

  return normalizeAccountSuggestions(res?.data?.accounts);
}

export async function getUserProfileByUsername(username, params = {}, options = {}) {
  const safeUsername = String(username || "").trim();

  const res = await api.get(`/users/${encodeURIComponent(safeUsername)}`, {
    ...options,
    params: {
      ...(params || {}),
      ...(options?.params || {})
    }
  });

  const data = res?.data ?? {};

  return {
    user: data?.user ?? null,
    stats: normalizeStats(data?.stats),
    posts: normalizePosts(data?.posts),
    total: asSafeNumber(data?.total, 0)
  };
}

export async function deleteOwnProfile(options = {}) {
  const res = await api.delete("/users/profile", options);
  return res?.data ?? null;
}