// backend/src/services/photoLocationSuggestion.service.js
import { ENV } from "../config/env.js";
import { calculateHaversineDistanceMeters, hasValidLatLng } from "../utils/geoDistance.js";
import { mapNominatimSearchResults } from "../utils/mapNominatim.js";
import {
  isEligiblePhotoLocationOsmType,
  isGenericPhotoLocationAddressType
} from "../utils/photoLocationEligibility.js";
import { detectLandmarkFromImageUrl } from "./visionLandmark.service.js";
import { searchPlacesForEnrichment } from "./nominatim.service.js";
import { canEnqueue, nominatimQueue } from "./nominatimQueue.js";

const MAX_VISION_CANDIDATES_TO_TRY = 3;
const MAX_NOMINATIM_RESULTS = 10;
const MAX_SUGGESTION_DISTANCE_METERS = 10_000;

const ELIGIBLE_OSM_DISTANCE_BONUS_METERS = 1200;
const GENERIC_PLACE_DISTANCE_PENALTY_METERS = 900;
const EXACT_NAME_MATCH_BONUS_METERS = 450;
const PARTIAL_NAME_MATCH_BONUS_METERS = 300;
const TOKEN_NAME_MATCH_BONUS_METERS = 150;

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const MULTISPACE_RE = /\s+/g;

const GENERIC_OSM_CLASSES = new Set([
  "boundary",
  "highway",
  "landuse",
  "place"
]);

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeSearchText(value) {
  const text = normalizeOptionalText(value);
  if (!text) return "";

  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RE, " ")
    .replace(MULTISPACE_RE, " ")
    .trim();
}

function normalizeOsmToken(value) {
  return normalizeSearchText(value).replace(/\s+/g, "_");
}

function isGenericMappedPlace(mappedPlace) {
  const osmClass = normalizeOsmToken(mappedPlace?.osmClass);

  return (
    GENERIC_OSM_CLASSES.has(osmClass) ||
    isGenericPhotoLocationAddressType(mappedPlace?.addressType)
  );
}

function getNameMatchDistanceBonus(candidateName, mappedPlace) {
  const candidateText = normalizeSearchText(candidateName);
  const placeText = normalizeSearchText(
    [mappedPlace?.locationName, mappedPlace?.displayName].filter(Boolean).join(" ")
  );

  if (!candidateText || !placeText) {
    return 0;
  }

  if (candidateText === placeText) {
    return EXACT_NAME_MATCH_BONUS_METERS;
  }

  if (placeText.includes(candidateText) || candidateText.includes(placeText)) {
    return PARTIAL_NAME_MATCH_BONUS_METERS;
  }

  const candidateTokens = new Set(candidateText.split(" ").filter(Boolean));
  const placeTokens = new Set(placeText.split(" ").filter(Boolean));

  let overlap = 0;
  for (const token of candidateTokens) {
    if (placeTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap > 0 ? TOKEN_NAME_MATCH_BONUS_METERS : 0;
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;

  const normalized = {
    name: normalizeOptionalText(candidate.name),
    score: toFiniteNumberOrNull(candidate.score),
    lat: toFiniteNumberOrNull(candidate.lat),
    lng: toFiniteNumberOrNull(candidate.lng)
  };

  if (!normalized.name) return null;
  if (!Number.isFinite(normalized.score)) return null;
  if (normalized.score < ENV.PHOTO_LOCATION_SUGGESTION_MIN_SCORE) return null;
  if (!hasValidLatLng(normalized.lat, normalized.lng)) return null;

  return normalized;
}

function getDetectionCandidates(detection) {
  const rawCandidates = Array.isArray(detection?.candidates)
    ? detection.candidates
    : detection?.landmarkDetected
      ? [
          {
            name: detection.name,
            score: detection.score,
            lat: detection.lat,
            lng: detection.lng
          }
        ]
      : [];

  return rawCandidates
    .map(normalizeCandidate)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISION_CANDIDATES_TO_TRY);
}

function getSuggestionMode(confidence) {
  return confidence >= ENV.VISION_STRONG_SCORE ? "autofill" : "suggest";
}

function scoreMappedPlace(candidate, mappedPlace) {
  if (!mappedPlace || !hasValidLatLng(mappedPlace.lat, mappedPlace.lng)) {
    return null;
  }

  let distanceMeters;

  try {
    distanceMeters = calculateHaversineDistanceMeters(
      candidate.lat,
      candidate.lng,
      mappedPlace.lat,
      mappedPlace.lng
    );
  } catch {
    return null;
  }

  if (!Number.isFinite(distanceMeters) || distanceMeters > MAX_SUGGESTION_DISTANCE_METERS) {
    return null;
  }

  const eligibleOsmType = isEligiblePhotoLocationOsmType({
    osmClass: mappedPlace.osmClass,
    osmSubtype: mappedPlace.osmSubtype
  });

  const genericMappedPlace = isGenericMappedPlace(mappedPlace);
  const nameMatchBonusMeters = getNameMatchDistanceBonus(candidate.name, mappedPlace);

  const effectiveDistanceMeters =
    distanceMeters -
    (eligibleOsmType ? ELIGIBLE_OSM_DISTANCE_BONUS_METERS : 0) +
    (genericMappedPlace ? GENERIC_PLACE_DISTANCE_PENALTY_METERS : 0) -
    nameMatchBonusMeters;

  return {
    mappedPlace,
    distanceMeters,
    effectiveDistanceMeters,
    eligibleOsmType,
    genericMappedPlace
  };
}

function pickBestMappedPlace(candidate, mappedPlaces) {
  let best = null;

  for (const mappedPlace of mappedPlaces) {
    const scored = scoreMappedPlace(candidate, mappedPlace);
    if (!scored) continue;

    if (!best) {
      best = scored;
      continue;
    }

    if (scored.effectiveDistanceMeters < best.effectiveDistanceMeters) {
      best = scored;
      continue;
    }

    if (scored.effectiveDistanceMeters === best.effectiveDistanceMeters) {
      if (scored.distanceMeters < best.distanceMeters) {
        best = scored;
        continue;
      }

      if (scored.distanceMeters === best.distanceMeters && scored.eligibleOsmType && !best.eligibleOsmType) {
        best = scored;
      }
    }
  }

  return best;
}

async function resolveCandidateToPlace(candidate) {
  if (!canEnqueue()) {
    return {
      ok: false,
      reason: "queue_busy"
    };
  }

  const raw = await nominatimQueue.add(() =>
    searchPlacesForEnrichment(candidate.name, null, {
      queryOverride: candidate.name,
      limit: MAX_NOMINATIM_RESULTS
    })
  );

  const mappedPlaces = mapNominatimSearchResults(raw, { limit: MAX_NOMINATIM_RESULTS });
  const best = pickBestMappedPlace(candidate, mappedPlaces);

  if (!best) {
    return {
      ok: false,
      reason: "no_geocoded_landmark_match"
    };
  }

  return {
    ok: true,
    reason: null,
    candidate,
    mappedPlace: best.mappedPlace,
    distanceMeters: best.distanceMeters
  };
}

function buildSuggestion(resolved) {
  const { candidate, mappedPlace, distanceMeters } = resolved;

  return {
    source: "vision_nominatim",
    mode: getSuggestionMode(candidate.score),

    detectedName: candidate.name,
    confidence: candidate.score,
    detectionLat: candidate.lat,
    detectionLng: candidate.lng,
    distanceMeters,

    lat: mappedPlace.lat,
    lng: mappedPlace.lng,
    locationName: mappedPlace.locationName,
    city: mappedPlace.city || "",
    country: mappedPlace.country || "",
    displayName: mappedPlace.displayName || mappedPlace.locationName,
    osmClass: mappedPlace.osmClass || "",
    osmSubtype: mappedPlace.osmSubtype || "",
    addressType: mappedPlace.addressType || ""
  };
}

export async function suggestLocationFromPhoto(input = {}, { logContext = {} } = {}) {
  if (!ENV.PHOTO_LOCATION_VERIFICATION_ENABLED) {
    return {
      suggestion: null,
      reason: "feature_disabled"
    };
  }

  const imageUrl = normalizeOptionalText(input.imageUrl);

  if (!imageUrl) {
    return {
      suggestion: null,
      reason: "missing_image_url"
    };
  }

  try {
    const detection = await detectLandmarkFromImageUrl(imageUrl);
    const candidates = getDetectionCandidates(detection);

    if (candidates.length === 0) {
      return {
        suggestion: null,
        reason: detection?.landmarkDetected
          ? "no_eligible_landmark_candidate"
          : "no_landmark_detected"
      };
    }

    let finalReason = "no_geocoded_landmark_match";

    for (const candidate of candidates) {
      const resolved = await resolveCandidateToPlace(candidate);

      if (resolved?.ok) {
        return {
          suggestion: buildSuggestion(resolved),
          reason: null
        };
      }

      if (resolved?.reason === "queue_busy") {
        finalReason = "queue_busy";
        break;
      }

      if (resolved?.reason) {
        finalReason = resolved.reason;
      }
    }

    return {
      suggestion: null,
      reason: finalReason
    };
  } catch (err) {
    console.warn("Photo location suggestion failed; returning no suggestion", {
      ...logContext,
      imageUrl,
      error: err?.message || String(err),
      code: err?.code || null,
      status: err?.status ?? null
    });

    return {
      suggestion: null,
      reason: "provider_error"
    };
  }
}