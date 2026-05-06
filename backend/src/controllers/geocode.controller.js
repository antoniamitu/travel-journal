// backend/src/controllers/geocode.controller.js
import { getPrisma } from "../config/prisma.js";
import { ENV } from "../config/env.js";
import { CACHE_TYPES } from "../constants/cacheTypes.js";
import {
  geocodeSearchSchema,
  geocodeReverseSchema,
  geocodePhotoSuggestionSchema
} from "../validators/query.validator.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { normalizeQuery } from "../utils/normalizeQuery.js";
import { mapNominatimSearchResults, mapNominatimReverseResult } from "../utils/mapNominatim.js";
import { setRetryAfterHeader } from "../utils/slidingWindowRateLimiter.js";
import { nominatimQueue, canEnqueue, getQueueStats } from "../services/nominatimQueue.js";
import {
  NOMINATIM_ACCEPT_LANGUAGE,
  forwardGeocode,
  reverseGeocode,
  searchPlacesForEnrichment
} from "../services/nominatim.service.js";
import { suggestLocationFromPhoto } from "../services/photoLocationSuggestion.service.js";
import { getUploadFolderForUser } from "../services/cloudinary.service.js";
import { checkGeocodeLimit } from "../utils/geocodeRateLimit.js";
import { HttpError } from "../utils/httpError.js";
import { calculateHaversineDistanceMeters } from "../utils/geoDistance.js";
import { classifyPlaceCategory } from "../utils/classifyPlaceCategory.js";
import { getPhotoLocationEligibility } from "../utils/photoLocationEligibility.js";

const GENERIC_REVERSE_OSM_CLASSES = new Set([
  "boundary",
  "building",
  "highway",
  "landuse",
  "place"
]);

const GENERIC_REVERSE_ADDRESS_TYPES = new Set([
  "house_number",
  "neighbourhood",
  "neighborhood",
  "path",
  "pedestrian",
  "quarter",
  "residential",
  "road",
  "suburb"
]);

const GENERIC_REVERSE_NATURAL_SUBTYPES = new Set([
  "bare_rock",
  "fell",
  "grass",
  "grassland",
  "heath",
  "moor",
  "mud",
  "sand",
  "scree",
  "scrub",
  "shingle",
  "shrubbery",
  "tree",
  "tree_row",
  "tundra",
  "wetland",
  "wood"
]);

const RECOGNIZABLE_BUILDING_SUBTYPES = new Set([
  "basilica",
  "cathedral",
  "chapel",
  "church",
  "monastery",
  "mosque",
  "palace",
  "shrine",
  "synagogue",
  "temple"
]);

const RECOGNIZABLE_BUILDING_ADDRESS_TYPES = new Set([
  "basilica",
  "cathedral",
  "chapel",
  "church",
  "monastery",
  "mosque",
  "palace",
  "place_of_worship",
  "shrine",
  "synagogue",
  "temple"
]);

const QUERY_LEADING_GENERIC_TOKENS = new Set([
  "allee",
  "allée",
  "avenue",
  "ave",
  "blvd",
  "boulevard",
  "court",
  "cour",
  "chemin",
  "path",
  "piazza",
  "place",
  "plaza",
  "road",
  "route",
  "rue",
  "square",
  "strada",
  "street",
  "via",
  "way"
]);

const QUERY_CONNECTOR_TOKENS = new Set([
  "a",
  "al",
  "ale",
  "alle",
  "aux",
  "da",
  "de",
  "dei",
  "del",
  "della",
  "des",
  "di",
  "du",
  "la",
  "le",
  "les",
  "l",
  "of",
  "the"
]);

const MAX_REFINEMENT_CANDIDATES = 5;
const MAX_REFINEMENT_DISTANCE_METERS = 350;
const MIN_REFINEMENT_SCORE = 6;
const STRONG_REFINEMENT_SCORE = 12;

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

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values || []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function normalizeOsmToken(value) {
  const normalized = normalizeQuery(value);
  return normalized ? normalized.replace(/\s+/g, "_") : "";
}

function tokenizeNormalized(value) {
  const normalized = normalizeQuery(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function pickFirstDisplaySegment(displayName) {
  const normalizedDisplayName = normalizeOptionalText(displayName);
  if (!normalizedDisplayName) return null;

  const first = normalizedDisplayName.split(",")[0]?.trim();
  return first || null;
}

function isGenericReverseResult(result) {
  const osmClass = normalizeOsmToken(result?.osmClass);
  const osmSubtype = normalizeOsmToken(result?.osmSubtype);
  const addressType = normalizeOsmToken(result?.addressType);

  const isRecognizableBuilding =
    osmClass === "building" &&
    (RECOGNIZABLE_BUILDING_SUBTYPES.has(osmSubtype) ||
      RECOGNIZABLE_BUILDING_ADDRESS_TYPES.has(addressType));

  if (isRecognizableBuilding) {
    return false;
  }

  const isGenericNatural =
    osmClass === "natural" &&
    (!osmSubtype || GENERIC_REVERSE_NATURAL_SUBTYPES.has(osmSubtype));

  return (
    !osmClass ||
    GENERIC_REVERSE_OSM_CLASSES.has(osmClass) ||
    GENERIC_REVERSE_ADDRESS_TYPES.has(addressType) ||
    isGenericNatural
  );
}

function stripLeadingGenericTokens(value) {
  const tokens = tokenizeNormalized(value);
  if (!tokens.length) return "";

  let start = 0;

  if (QUERY_LEADING_GENERIC_TOKENS.has(tokens[start])) {
    start += 1;
    while (start < tokens.length && QUERY_CONNECTOR_TOKENS.has(tokens[start])) {
      start += 1;
    }
  }

  const cleaned = tokens.slice(start).join(" ").trim();
  return cleaned || tokens.join(" ");
}

function roughTokenMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;

  return a.startsWith(b) || b.startsWith(a);
}

function countRoughTokenOverlaps(query, candidateText) {
  const queryTokens = tokenizeNormalized(query);
  const candidateTokens = tokenizeNormalized(candidateText);
  if (!queryTokens.length || !candidateTokens.length) return 0;

  let matches = 0;

  for (const queryToken of queryTokens) {
    if (candidateTokens.some((candidateToken) => roughTokenMatch(queryToken, candidateToken))) {
      matches += 1;
    }
  }

  return matches;
}

function buildRefinementQueries(result) {
  const labels = uniqueStrings([
    normalizeOptionalText(result?.locationName),
    pickFirstDisplaySegment(result?.displayName)
  ]);

  const queries = [];

  for (const label of labels) {
    const normalized = normalizeQuery(label);
    if (normalized) {
      queries.push(normalized);
    }

    const cleaned = stripLeadingGenericTokens(label);
    if (cleaned && cleaned !== normalized) {
      queries.push(cleaned);
    }
  }

  return uniqueStrings(queries).filter((query) => query.length >= 3);
}

function isLexicallyCompatible(refinementQuery, candidate) {
  const queryKey = normalizeQuery(refinementQuery);
  const candidateText = [candidate?.locationName, candidate?.displayName].filter(Boolean).join(" ");
  const candidateKey = normalizeQuery(candidateText);

  if (!queryKey || !candidateKey) {
    return false;
  }

  if (candidateKey.includes(queryKey) || queryKey.includes(candidateKey)) {
    return true;
  }

  return countRoughTokenOverlaps(queryKey, candidateText) > 0;
}

function scoreRefinementCandidate(candidate, originalResult, refinementQuery) {
  if (!candidate || isGenericReverseResult(candidate)) {
    return null;
  }

  if (!isLexicallyCompatible(refinementQuery, candidate)) {
    return null;
  }

  let distanceMeters;
  try {
    distanceMeters = calculateHaversineDistanceMeters(
      originalResult.lat,
      originalResult.lng,
      candidate.lat,
      candidate.lng
    );
  } catch {
    return null;
  }

  if (!Number.isFinite(distanceMeters) || distanceMeters > MAX_REFINEMENT_DISTANCE_METERS) {
    return null;
  }

  const eligibility = getPhotoLocationEligibility({
    latitude: candidate.lat,
    longitude: candidate.lng,
    locationName: candidate.locationName,
    city: candidate.city,
    country: candidate.country,
    displayName: candidate.displayName,
    osmClass: candidate.osmClass,
    osmSubtype: candidate.osmSubtype,
    addressType: candidate.addressType
  });

  const category = classifyPlaceCategory({
    locationName: candidate.locationName,
    city: candidate.city,
    country: candidate.country,
    displayName: candidate.displayName,
    osmClass: candidate.osmClass,
    osmSubtype: candidate.osmSubtype,
    addressType: candidate.addressType
  });

  const queryKey = normalizeQuery(refinementQuery);
  const candidateKey = normalizeQuery(candidate.locationName || candidate.displayName || "");
  const overlapCount = countRoughTokenOverlaps(
    refinementQuery,
    [candidate.locationName, candidate.displayName].filter(Boolean).join(" ")
  );

  let score = overlapCount * 5;

  if (
    candidateKey &&
    (candidateKey === queryKey || candidateKey.includes(queryKey) || queryKey.includes(candidateKey))
  ) {
    score += 4;
  }

  if (eligibility.shouldCheck) {
    score += 6;
  } else if (category !== "other") {
    score += 3;
  }

  const addressType = normalizeOsmToken(candidate.addressType);
  if (addressType && !GENERIC_REVERSE_ADDRESS_TYPES.has(addressType)) {
    score += 2;
  }

  const osmClass = normalizeOsmToken(candidate.osmClass);
  if (
    osmClass &&
    !GENERIC_REVERSE_OSM_CLASSES.has(osmClass) &&
    !(osmClass === "natural" && GENERIC_REVERSE_NATURAL_SUBTYPES.has(normalizeOsmToken(candidate.osmSubtype)))
  ) {
    score += 1;
  }

  score -= Math.min(distanceMeters, MAX_REFINEMENT_DISTANCE_METERS) / 200;

  if (score < MIN_REFINEMENT_SCORE) {
    return null;
  }

  return {
    candidate,
    distanceMeters,
    score,
    category,
    eligibility
  };
}

function isBetterRefinementCandidate(next, current) {
  if (!current) return true;

  if (next.score !== current.score) {
    return next.score > current.score;
  }

  if (next.distanceMeters !== current.distanceMeters) {
    return next.distanceMeters < current.distanceMeters;
  }

  const nextEligible = next.eligibility?.shouldCheck ? 1 : 0;
  const currentEligible = current.eligibility?.shouldCheck ? 1 : 0;
  if (nextEligible !== currentEligible) {
    return nextEligible > currentEligible;
  }

  return next.category !== "other" && current.category === "other";
}

async function refineReverseResultIfNeeded(result, logContext = {}) {
  if (!result) {
    return {
      result,
      refinementMeta: {
        applied: false,
        reason: "no_result"
      }
    };
  }

  if (!isGenericReverseResult(result)) {
    return {
      result,
      refinementMeta: {
        applied: false,
        reason: "already_specific"
      }
    };
  }

  const queries = buildRefinementQueries(result);
  if (!queries.length) {
    return {
      result,
      refinementMeta: {
        applied: false,
        reason: "no_refinement_query"
      }
    };
  }

  if (!canEnqueue()) {
    console.warn("[geocode] skipped reverse refinement because queue is busy", {
      ...logContext,
      locationName: result.locationName,
      queries
    });

    return {
      result,
      refinementMeta: {
        applied: false,
        reason: "queue_busy",
        queries
      }
    };
  }

  let best = null;
  let usedQuery = null;
  let examinedCandidates = 0;

  for (const queryOverride of queries) {
    let raw;
    try {
      raw = await nominatimQueue.add(() =>
        searchPlacesForEnrichment(result.locationName, result.city, {
          limit: MAX_REFINEMENT_CANDIDATES,
          queryOverride
        })
      );
    } catch (err) {
      console.warn("[geocode] reverse refinement lookup failed", {
        ...logContext,
        locationName: result.locationName,
        queryOverride,
        error: err?.message || String(err)
      });
      continue;
    }

    const candidates = mapNominatimSearchResults(raw);

    for (const candidate of candidates) {
      examinedCandidates += 1;
      const scored = scoreRefinementCandidate(candidate, result, queryOverride);
      if (!scored) continue;

      if (isBetterRefinementCandidate(scored, best)) {
        best = scored;
        usedQuery = queryOverride;
      }
    }

    if (best && best.score >= STRONG_REFINEMENT_SCORE) {
      break;
    }
  }

  if (!best) {
    return {
      result,
      refinementMeta: {
        applied: false,
        reason: "no_specific_candidate",
        queries,
        examinedCandidates
      }
    };
  }

  return {
    result: best.candidate,
    refinementMeta: {
      applied: true,
      reason: "generic_reverse_refined",
      query: usedQuery,
      originalLocationName: result.locationName,
      refinedLocationName: best.candidate.locationName,
      distanceMeters: best.distanceMeters,
      candidateScore: Number(best.score.toFixed(2)),
      category: best.category,
      eligible: best.eligibility?.shouldCheck === true,
      examinedCandidates
    }
  };
}

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

function parseUrlSafe(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isCloudinarySecureUrlForThisCloud(secureUrl) {
  const url = parseUrlSafe(secureUrl);
  if (!url) return false;

  if (url.protocol !== "https:") return false;
  if (url.hostname !== "res.cloudinary.com") return false;

  return url.pathname.startsWith(`/${ENV.CLOUDINARY_CLOUD_NAME}/image/upload/`);
}

function urlPathContainsPublicId(secureUrl, publicId) {
  const url = parseUrlSafe(secureUrl);
  if (!url) return false;

  const marker = `/${publicId}`;
  const idx = url.pathname.lastIndexOf(marker);
  if (idx < 0) return false;

  const after = url.pathname.slice(idx + marker.length);
  return after === "" || after.startsWith(".") || after.startsWith("/");
}

function validatePhotoSuggestionImageForUser(userId, input) {
  const publicId = String(input.publicId || "").trim();
  const imageUrl = String(input.imageUrl || "").trim();

  const folderPrefix = getUploadFolderForUser(userId) + "/";

  if (!publicId.startsWith(folderPrefix)) {
    throw new HttpError(400, "Validation failed", {
      publicId: `publicId must start with "${folderPrefix}"`
    });
  }

  if (!isCloudinarySecureUrlForThisCloud(imageUrl)) {
    throw new HttpError(400, "Validation failed", {
      imageUrl: "imageUrl must be a Cloudinary https URL for this account"
    });
  }

  if (!urlPathContainsPublicId(imageUrl, publicId)) {
    throw new HttpError(400, "Validation failed", {
      imageUrl: "imageUrl does not match publicId"
    });
  }
}

export async function photoSuggestion(req, res) {
  const parsed = geocodePhotoSuggestionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  validatePhotoSuggestionImageForUser(req.userId, parsed.data);

  const limit = checkGeocodeLimit(req.userId, req.ip);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    throw new HttpError(429, "Too many geocoding requests, please slow down");
  }

  const result = await suggestLocationFromPhoto(parsed.data, {
    logContext: {
      action: "photo-suggestion",
      userId: req.userId,
      publicId: parsed.data.publicId
    }
  });

  return res.status(200).json({
    ok: true,
    suggestion: result.suggestion,
    reason: result.reason,
    ...devMeta({
      stage: "photo-suggestion",
      mode: result.suggestion?.mode || null,
      detectedName: result.suggestion?.detectedName || null,
      confidence: result.suggestion?.confidence ?? null
    })
  });
}

export async function search(req, res) {
  const parsed = geocodeSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const query = parsed.data.query;
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length < 3) {
    throw new HttpError(400, "Validation failed", {
      query: "Query must contain at least 3 alphanumeric characters"
    });
  }

  const cacheKey = `${NOMINATIM_ACCEPT_LANGUAGE}:${normalizedQuery}`;

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

  const key = `${NOMINATIM_ACCEPT_LANGUAGE}:${lat.toFixed(3)},${lng.toFixed(3)}`;

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
    const mapped = mapNominatimReverseResult(cached.results_json, lat, lng);

    const mayNeedExternalRefinement =
      mapped &&
      isGenericReverseResult(mapped) &&
      buildRefinementQueries(mapped).length > 0 &&
      canEnqueue();

    if (mayNeedExternalRefinement) {
      const limit = checkGeocodeLimit(req.userId, req.ip);

      if (!limit.ok) {
        setRetryAfterHeader(res, limit.retryAfterMs);
        throw new HttpError(429, "Too many geocoding requests, please slow down");
      }
    }

    const { result, refinementMeta } = await refineReverseResultIfNeeded(mapped, {
      action: "reverse",
      source: "cache",
      lat,
      lng,
      cacheKey: key
    });

    return res.status(200).json({
      ok: true,
      source: "cache",
      cache: { id: cached.id, created_at: cached.created_at },
      result,
      ...devMeta({ stage: "step3-cache-hit", cacheKey: key, refinement: refinementMeta })
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

  const mapped = mapNominatimReverseResult(raw, lat, lng);
  const { result, refinementMeta } = await refineReverseResultIfNeeded(mapped, {
    action: "reverse",
    source: "nominatim",
    lat,
    lng,
    cacheKey: key
  });

  return res.status(200).json({
    ok: true,
    source: "nominatim",
    result,
    ...devMeta({
      stage: "step3-upstream",
      queue: getQueueStats(),
      cacheKey: key,
      refinement: refinementMeta
    })
  });
}