// backend/src/utils/photoLocationVerificationPolicy.js

import { ENV } from "../config/env.js";

export const DEFAULT_PHOTO_VERIFICATION_PROVIDER = "google_vision";

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeScore(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return null;
    }

    return n;
  }

  const n =
    typeof value === "object" && typeof value.toString === "function"
      ? Number(value.toString())
      : Number(value);

  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return null;
  }

  return n;
}

function normalizeDistanceMeters(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }

    return Math.round(n);
  }

  const n =
    typeof value === "object" && typeof value.toString === "function"
      ? Number(value.toString())
      : Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return null;
  }

  return Math.round(n);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values || []) {
    if (typeof value !== "string") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

export function decidePhotoLocationVerification({ eligibility, detection } = {}) {
  const baseReasons = Array.isArray(eligibility?.reasons) ? eligibility.reasons : [];
  const reasons = uniqueStrings(baseReasons);

  if (!eligibility?.shouldCheck) {
    return {
      status: "skipped",
      confidence: null,
      distanceMeters: null,
      detectedName: null,
      reasons: reasons.length > 0 ? reasons : ["skipped"],
      provider: null
    };
  }

  const provider =
    normalizeOptionalText(detection?.provider) || DEFAULT_PHOTO_VERIFICATION_PROVIDER;
  const landmarkDetected = detection?.landmarkDetected === true;
  const confidence = normalizeScore(detection?.score);
  const distanceMeters = normalizeDistanceMeters(detection?.distanceMeters);
  const detectedName = normalizeOptionalText(detection?.name);

  if (!landmarkDetected) {
    return {
      status: "uncertain",
      confidence: null,
      distanceMeters: null,
      detectedName: null,
      reasons: uniqueStrings([...reasons, "no_landmark_detected"]),
      provider
    };
  }

  if (confidence === null) {
    return {
      status: "uncertain",
      confidence: null,
      distanceMeters,
      detectedName,
      reasons: uniqueStrings([...reasons, "landmark_detected", "missing_landmark_score"]),
      provider
    };
  }

  if (confidence < ENV.VISION_MIN_SCORE) {
    return {
      status: "uncertain",
      confidence,
      distanceMeters,
      detectedName,
      reasons: uniqueStrings([...reasons, "landmark_detected", "score_below_min_threshold"]),
      provider
    };
  }

  if (distanceMeters === null) {
    return {
      status: "uncertain",
      confidence,
      distanceMeters: null,
      detectedName,
      reasons: uniqueStrings([...reasons, "landmark_detected", "missing_landmark_coordinates"]),
      provider
    };
  }

  if (distanceMeters <= ENV.LANDMARK_MATCH_MAX_DISTANCE_METERS) {
    return {
      status: "match",
      confidence,
      distanceMeters,
      detectedName,
      reasons: uniqueStrings([...reasons, "landmark_detected", "distance_within_match_threshold"]),
      provider
    };
  }

  if (distanceMeters >= ENV.LANDMARK_MISMATCH_MIN_DISTANCE_METERS) {
    if (confidence >= ENV.PHOTO_LOCATION_MISMATCH_MIN_SCORE) {
      return {
        status: "mismatch",
        confidence,
        distanceMeters,
        detectedName,
        reasons: uniqueStrings([
          ...reasons,
          "landmark_detected",
          "distance_above_mismatch_threshold",
          "score_meets_mismatch_threshold"
        ]),
        provider
      };
    }

    return {
      status: "uncertain",
      confidence,
      distanceMeters,
      detectedName,
      reasons: uniqueStrings([
        ...reasons,
        "landmark_detected",
        "distance_above_mismatch_threshold",
        "score_below_mismatch_threshold"
      ]),
      provider
    };
  }

  return {
    status: "uncertain",
    confidence,
    distanceMeters,
    detectedName,
    reasons: uniqueStrings([...reasons, "landmark_detected", "distance_in_gray_zone"]),
    provider
  };
}