// backend/src/services/photoLocationVerification.service.js

import { ENV } from "../config/env.js";
import { calculateHaversineDistanceMeters, hasValidLatLng } from "../utils/geoDistance.js";
import { getPhotoLocationEligibility } from "../utils/photoLocationEligibility.js";
import {
  decidePhotoLocationVerification,
  DEFAULT_PHOTO_VERIFICATION_PROVIDER
} from "../utils/photoLocationVerificationPolicy.js";
import { detectLandmarkFromImageUrl } from "./visionLandmark.service.js";

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
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
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
    return buildSkippedResult("feature_disabled", selectedLocation);
  }

  const primaryImageUrl = pickPrimaryImageUrl(input.images);
  if (!primaryImageUrl) {
    return buildSkippedResult("no_images", selectedLocation);
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

  if (!eligibility.shouldCheck) {
    return {
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
  }

  try {
    const detection = await detectLandmarkFromImageUrl(primaryImageUrl);

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

    const result = {
      ...decision,
      shouldCheck: true,
      checkedAt: new Date(),
      selectedLocation,
      detectedLandmark: detection.landmarkDetected
        ? {
            name: detection.name,
            score: detection.score,
            lat: detection.lat,
            lng: detection.lng
          }
        : null
    };

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
      code: err?.code || null
    });

    return {
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
  }
}