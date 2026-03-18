// backend/src/controllers/geocode.controller.js
import { getPrisma } from "../config/prisma.js";
import { ENV } from "../config/env.js";
import { CACHE_TYPES } from "../constants/cacheTypes.js";
import { geocodeSearchSchema, geocodeReverseSchema } from "../validators/query.validator.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { normalizeQuery } from "../utils/normalizeQuery.js";
import { mapNominatimSearchResults, mapNominatimReverseResult } from "../utils/mapNominatim.js";
import { setRetryAfterHeader } from "../utils/slidingWindowRateLimiter.js";
import { nominatimQueue, canEnqueue, getQueueStats } from "../services/nominatimQueue.js";
import { forwardGeocode, reverseGeocode } from "../services/nominatim.service.js";
import { checkGeocodeLimit } from "../utils/geocodeRateLimit.js";
import { HttpError } from "../utils/httpError.js";

function devMeta(obj) {
  return ENV.NODE_ENV === "development" ? obj : {};
}

const fixNegZero = (n) => (Object.is(n, -0) ? 0 : n);

// TTL = 7 days
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cutoffDate = () => new Date(Date.now() - TTL_MS);

// cleanup throttled
let lastCleanupAtMs = 0;
const CLEANUP_INTERVAL_MS = 60_000;

async function cleanupExpiredCache(prisma, cutoff) {
  const now = Date.now();
  if (now - lastCleanupAtMs < CLEANUP_INTERVAL_MS) return;
  lastCleanupAtMs = now;

  try {
    await prisma.geocodeCache.deleteMany({ where: { created_at: { lt: cutoff } } });
  } catch (err) {
    console.warn("[geocode] cache cleanup failed:", err?.message || err);
  }
}

export async function search(req, res) {
  const parsed = geocodeSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const query = parsed.data.query;
  const cacheKey = normalizeQuery(query);

  if (cacheKey.length < 3) {
    throw new HttpError(400, "Validation failed", {
      query: "Query must contain at least 3 alphanumeric characters"
    });
  }

  const prisma = getPrisma();
  const cutoff = cutoffDate();
  await cleanupExpiredCache(prisma, cutoff);

  const cached = await prisma.geocodeCache.findFirst({
    where: {
      cache_key: cacheKey,
      cache_type: CACHE_TYPES.FORWARD,
      created_at: { gte: cutoff }
    },
    select: { id: true, results_json: true, created_at: true }
  });

  if (cached) {
    const results = mapNominatimSearchResults(cached.results_json);
    return res.status(200).json({
      ok: true,
      source: "cache",
      cache: { id: cached.id, created_at: cached.created_at },
      results,
      ...devMeta({ stage: "step3-cache-hit", cacheKey })
    });
  }

  if (!canEnqueue()) {
    throw new HttpError(503, "Geocoding service is busy, please try again shortly");
  }

  const limit = checkGeocodeLimit(req.userId, req.ip);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    throw new HttpError(429, "Too many geocoding requests, please slow down");
  }

  let raw;
  try {
    raw = await nominatimQueue.add(() => forwardGeocode(query));
  } catch (err) {
    console.warn("[geocode] queue failure (forward):", err?.message || err);
    throw new HttpError(503, "Geocoding service temporarily unavailable. Please try again shortly.");
  }

  await prisma.geocodeCache.upsert({
    where: {
      cache_key_cache_type: { cache_key: cacheKey, cache_type: CACHE_TYPES.FORWARD }
    },
    create: {
      cache_key: cacheKey,
      cache_type: CACHE_TYPES.FORWARD,
      results_json: raw
    },
    update: {
      results_json: raw,
      created_at: new Date()
    }
  });

  const results = mapNominatimSearchResults(raw);

  return res.status(200).json({
    ok: true,
    source: "nominatim",
    results,
    ...devMeta({ stage: "step3-upstream", queue: getQueueStats(), cacheKey })
  });
}

export async function reverse(req, res) {
  const parsed = geocodeReverseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  let { lat, lng } = parsed.data;
  lat = fixNegZero(lat);
  lng = fixNegZero(lng);

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;

  const prisma = getPrisma();
  const cutoff = cutoffDate();
  await cleanupExpiredCache(prisma, cutoff);

  const cached = await prisma.geocodeCache.findFirst({
    where: {
      cache_key: key,
      cache_type: CACHE_TYPES.REVERSE,
      created_at: { gte: cutoff }
    },
    select: { id: true, results_json: true, created_at: true }
  });

  if (cached) {
    const result = mapNominatimReverseResult(cached.results_json, lat, lng);
    return res.status(200).json({
      ok: true,
      source: "cache",
      cache: { id: cached.id, created_at: cached.created_at },
      result,
      ...devMeta({ stage: "step3-cache-hit", cacheKey: key })
    });
  }

  if (!canEnqueue()) {
    throw new HttpError(503, "Geocoding service is busy, please try again shortly");
  }

  const limit = checkGeocodeLimit(req.userId, req.ip);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    throw new HttpError(429, "Too many geocoding requests, please slow down");
  }

  let raw;
  try {
    raw = await nominatimQueue.add(() => reverseGeocode(lat, lng));
  } catch (err) {
    console.warn("[geocode] queue failure (reverse):", err?.message || err);
    throw new HttpError(503, "Geocoding service temporarily unavailable. Please try again shortly.");
  }

  await prisma.geocodeCache.upsert({
    where: {
      cache_key_cache_type: { cache_key: key, cache_type: CACHE_TYPES.REVERSE }
    },
    create: {
      cache_key: key,
      cache_type: CACHE_TYPES.REVERSE,
      results_json: raw
    },
    update: {
      results_json: raw,
      created_at: new Date()
    }
  });

  const result = mapNominatimReverseResult(raw, lat, lng);

  return res.status(200).json({
    ok: true,
    source: "nominatim",
    result,
    ...devMeta({ stage: "step3-upstream", queue: getQueueStats(), cacheKey: key })
  });
}