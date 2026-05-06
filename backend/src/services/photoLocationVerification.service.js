// backend/src/services/photoLocationVerification.service.js
import { ENV } from "../config/env.js";
import { calculateHaversineDistanceMeters, hasValidLatLng } from "../utils/geoDistance.js";
import { getPhotoLocationEligibility } from "../utils/photoLocationEligibility.js";
import {
  decidePhotoLocationVerification,
  DEFAULT_PHOTO_VERIFICATION_PROVIDER
} from "../utils/photoLocationVerificationPolicy.js";
import { detectLandmarkFromImageUrl } from "./visionLandmark.service.js";

const DEBUG_PREFIX = "[DEBUG photo-verification]";
const IS_DEBUG_LOGGING_ENABLED = ENV.NODE_ENV !== "production";

function debugLog(label, payload) {
  if (!IS_DEBUG_LOGGING_ENABLED) return;
  console.log(`${DEBUG_PREFIX} ${label}:`, payload);
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  const n =
    typeof value === "object" && typeof value.toString === "function"
      ? Number(value.toString())
      : Number(value);

  return Number.isFinite(n) ? n : null;
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

function getImageDisplayOrder(image, fallbackIndex) {
  const raw = image?.displayOrder ?? image?.display_order;
  const parsed = toFiniteNumberOrNull(raw);

  return parsed !== null ? parsed : fallbackIndex;
}

function pickPrimaryImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  const sortedImages = images
    .map((image, index) => ({
      image,
      index,
      displayOrder: getImageDisplayOrder(image, index)
    }))
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }

      return a.index - b.index;
    });

  for (const entry of sortedImages) {
    const secureUrl = normalizeOptionalText(entry.image?.secureUrl ?? entry.image?.secure_url);

    if (secureUrl) {
      return secureUrl;
    }
  }

  return null;
}

function buildSelectedLocation(input = {}) {
  return {
    lat: toFiniteNumberOrNull(input.latitude ?? input.lat),
    lng: toFiniteNumberOrNull(input.longitude ?? input.lng),
    locationName: normalizeOptionalText(input.locationName ?? input.location_name),
    city: normalizeOptionalText(input.city),
    country: normalizeOptionalText(input.country),
    displayName: normalizeOptionalText(input.displayName ?? input.display_name),
    osmClass: normalizeOptionalText(input.osmClass ?? input.osm_class),
    osmSubtype: normalizeOptionalText(input.osmSubtype ?? input.osm_subtype),
    addressType: normalizeOptionalText(input.addressType ?? input.address_type)
  };
}

function buildSkippedResult(reason, selectedLocation) {
  return {
    status: "skipped",
    shouldCheck: false,
    checkedAt: null,
    confidence: null,
    distanceMeters: null,
    detectedName: null,
    reasons: [reason],
    provider: null,
    selectedLocation,
    detectedLandmark: null
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const normalized = {
    name: normalizeOptionalText(candidate.name),
    score: toFiniteNumberOrNull(candidate.score),
    lat: toFiniteNumberOrNull(candidate.lat),
    lng: toFiniteNumberOrNull(candidate.lng)
  };

  const hasAnySignal =
    normalized.name !== null ||
    normalized.score !== null ||
    normalized.lat !== null ||
    normalized.lng !== null;

  return hasAnySignal ? normalized : null;
}

function extractLandmarkCandidates(detection) {
  if (!Array.isArray(detection?.candidates)) {
    return [];
  }

  return detection.candidates.map(normalizeCandidate).filter(Boolean);
}

function buildCandidateEvaluation(selectedLocation, eligibility, candidate, provider) {
  const distanceMeters =
    hasValidLatLng(selectedLocation.lat, selectedLocation.lng) &&
    hasValidLatLng(candidate.lat, candidate.lng)
      ? calculateHaversineDistanceMeters(
          selectedLocation.lat,
          selectedLocation.lng,
          candidate.lat,
          candidate.lng
        )
      : null;

  const decision = decidePhotoLocationVerification({
    eligibility,
    detection: {
      provider,
      landmarkDetected: true,
      name: candidate.name,
      score: candidate.score,
      distanceMeters
    }
  });

  return {
    candidate,
    decision,
    distanceMeters
  };
}

function pickBestEvaluation(evaluations) {
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return null;
  }

  const matchEvaluations = evaluations.filter((item) => item.decision?.status === "match");
  if (matchEvaluations.length > 0) {
    return matchEvaluations.reduce((best, current) => {
      const bestDistance = Number.isFinite(best.distanceMeters)
        ? best.distanceMeters
        : Number.POSITIVE_INFINITY;
      const currentDistance = Number.isFinite(current.distanceMeters)
        ? current.distanceMeters
        : Number.POSITIVE_INFINITY;

      if (currentDistance !== bestDistance) {
        return currentDistance < bestDistance ? current : best;
      }

      const bestScore = Number.isFinite(best.candidate?.score) ? best.candidate.score : -1;
      const currentScore = Number.isFinite(current.candidate?.score) ? current.candidate.score : -1;

      return currentScore > bestScore ? current : best;
    });
  }

  const mismatchEvaluations = evaluations.filter((item) => item.decision?.status === "mismatch");
  if (mismatchEvaluations.length > 0) {
    return mismatchEvaluations.reduce((best, current) => {
      const bestScore = Number.isFinite(best.candidate?.score) ? best.candidate.score : -1;
      const currentScore = Number.isFinite(current.candidate?.score) ? current.candidate.score : -1;

      if (currentScore !== bestScore) {
        return currentScore > bestScore ? current : best;
      }

      const bestDistance = Number.isFinite(best.distanceMeters) ? best.distanceMeters : -1;
      const currentDistance = Number.isFinite(current.distanceMeters) ? current.distanceMeters : -1;

      return currentDistance > bestDistance ? current : best;
    });
  }

  return evaluations.reduce((best, current) => {
    const bestScore = Number.isFinite(best.candidate?.score) ? best.candidate.score : -1;
    const currentScore = Number.isFinite(current.candidate?.score) ? current.candidate.score : -1;

    if (currentScore !== bestScore) {
      return currentScore > bestScore ? current : best;
    }

    const bestHasDistance = Number.isFinite(best.distanceMeters) ? 1 : 0;
    const currentHasDistance = Number.isFinite(current.distanceMeters) ? 1 : 0;

    if (currentHasDistance !== bestHasDistance) {
      return currentHasDistance > bestHasDistance ? current : best;
    }

    if (currentHasDistance && bestHasDistance) {
      return current.distanceMeters < best.distanceMeters ? current : best;
    }

    return best;
  });
}

export function toPhotoVerificationPersistenceFields(result) {
  if (!result || result.status === "skipped") {
    return {
      photo_verification_status: null,
      photo_verification_checked_at: null,
      photo_verification_confidence: null,
      photo_verification_distance_meters: null,
      photo_verification_detected_name: null,
      photo_verification_reasons: null,
      photo_verification_provider: null
    };
  }

  return {
    photo_verification_status: result.status,
    photo_verification_checked_at: result.checkedAt ?? new Date(),
    photo_verification_confidence: result.confidence ?? null,
    photo_verification_distance_meters: result.distanceMeters ?? null,
    photo_verification_detected_name: result.detectedName ?? null,
    photo_verification_reasons:
      Array.isArray(result.reasons) && result.reasons.length > 0 ? result.reasons : null,
    photo_verification_provider: result.provider ?? null
  };
}

export async function verifyPhotoLocationForPost(input = {}, { logContext = {} } = {}) {
  const selectedLocation = buildSelectedLocation(input);

  if (!ENV.PHOTO_LOCATION_VERIFICATION_ENABLED) {
    const result = buildSkippedResult("feature_disabled", selectedLocation);

    debugLog("feature-disabled", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      status: result.status,
      reasons: result.reasons
    });

    return result;
  }

  const primaryImageUrl = pickPrimaryImageUrl(input.images);
  if (!primaryImageUrl) {
    const result = buildSkippedResult("no_images", selectedLocation);

    debugLog("no-images", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      status: result.status,
      reasons: result.reasons
    });

    return result;
  }

  const eligibility = getPhotoLocationEligibility({
    latitude: selectedLocation.lat,
    longitude: selectedLocation.lng,
    locationName: selectedLocation.locationName,
    city: selectedLocation.city,
    country: selectedLocation.country,
    displayName: selectedLocation.displayName,
    osmClass: selectedLocation.osmClass,
    osmSubtype: selectedLocation.osmSubtype,
    addressType: selectedLocation.addressType
  });

  debugLog("eligibility", {
    ...logContext,
    selectedLocationName: selectedLocation.locationName,
    shouldCheck: eligibility.shouldCheck,
    reasons: eligibility.reasons,
    osmClass: eligibility.normalized?.osmClass,
    osmSubtype: eligibility.normalized?.osmSubtype,
    addressType: eligibility.normalized?.addressType
  });

  if (!eligibility.shouldCheck) {
    const result = {
      status: "skipped",
      shouldCheck: false,
      checkedAt: null,
      confidence: null,
      distanceMeters: null,
      detectedName: null,
      reasons: uniqueStrings(eligibility.reasons),
      provider: null,
      selectedLocation,
      detectedLandmark: null
    };

    debugLog("result", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      status: result.status,
      reasons: result.reasons
    });

    return result;
  }

  try {
    const detection = await detectLandmarkFromImageUrl(primaryImageUrl);

    debugLog("detection", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      selectedImageUrl: primaryImageUrl,
      visionImageUrl: detection?.imageUrlUsed ?? primaryImageUrl,
      detection
    });

    const provider =
      normalizeOptionalText(detection?.provider) || DEFAULT_PHOTO_VERIFICATION_PROVIDER;

    const candidates = extractLandmarkCandidates(detection);
    const evaluations = candidates.map((candidate) =>
      buildCandidateEvaluation(selectedLocation, eligibility, candidate, provider)
    );

    debugLog("candidate-evaluations", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      evaluations: evaluations.map((item) => ({
        candidateName: item.candidate?.name,
        candidateScore: item.candidate?.score,
        distanceMeters: item.distanceMeters,
        status: item.decision?.status,
        reasons: item.decision?.reasons
      }))
    });

    let chosen = pickBestEvaluation(evaluations);

    if (!chosen) {
      const distanceMeters =
        detection.landmarkDetected &&
        hasValidLatLng(selectedLocation.lat, selectedLocation.lng) &&
        hasValidLatLng(detection.lat, detection.lng)
          ? calculateHaversineDistanceMeters(
              selectedLocation.lat,
              selectedLocation.lng,
              detection.lat,
              detection.lng
            )
          : null;

      const decision = decidePhotoLocationVerification({
        eligibility,
        detection: {
          ...detection,
          distanceMeters
        }
      });

      chosen = {
        candidate: detection.landmarkDetected
          ? {
              name: detection.name,
              score: detection.score,
              lat: detection.lat,
              lng: detection.lng
            }
          : null,
        decision,
        distanceMeters
      };
    }

    const result = {
      ...chosen.decision,
      shouldCheck: true,
      checkedAt: new Date(),
      selectedLocation,
      detectedLandmark: chosen.candidate
        ? {
            name: chosen.candidate.name,
            score: chosen.candidate.score,
            lat: chosen.candidate.lat,
            lng: chosen.candidate.lng
          }
        : null
    };

    debugLog("decision", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      selectedImageUrl: primaryImageUrl,
      visionImageUrl: detection?.imageUrlUsed ?? primaryImageUrl,
      detectedName: result.detectedName,
      confidence: result.confidence,
      distanceMeters: result.distanceMeters,
      status: result.status,
      reasons: result.reasons
    });

    if (result.status === "mismatch") {
      console.warn("Photo-location verification mismatch detected", {
        ...logContext,
        locationName: selectedLocation.locationName,
        detectedName: result.detectedName,
        confidence: result.confidence,
        distanceMeters: result.distanceMeters
      });
    }

    return result;
  } catch (err) {
    console.warn("Photo-location verification provider call failed; returning uncertain", {
      ...logContext,
      locationName: selectedLocation.locationName,
      error: err?.message || String(err),
      code: err?.code || null,
      status: err?.status ?? null,
      bodySample: err?.bodySample ?? null,
      selectedImageUrl: primaryImageUrl
    });

    const result = {
      status: "uncertain",
      shouldCheck: true,
      checkedAt: new Date(),
      confidence: null,
      distanceMeters: null,
      detectedName: null,
      reasons: uniqueStrings([...eligibility.reasons, "provider_error"]),
      provider: DEFAULT_PHOTO_VERIFICATION_PROVIDER,
      selectedLocation,
      detectedLandmark: null
    };

    debugLog("provider-error-result", {
      ...logContext,
      selectedLocationName: selectedLocation.locationName,
      error: err?.message || String(err),
      code: err?.code || null,
      status: err?.status ?? null,
      bodySample: err?.bodySample ?? null,
      statusResult: result.status,
      reasons: result.reasons,
      selectedImageUrl: primaryImageUrl
    });

    return result;
  }
}