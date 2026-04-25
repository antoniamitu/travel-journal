// backend/src/services/visionLandmark.service.js
import axios from "axios";
import { ENV } from "../config/env.js";
import { calculateHaversineDistanceMeters, hasValidLatLng } from "../utils/geoDistance.js";
import { DEFAULT_PHOTO_VERIFICATION_PROVIDER } from "../utils/photoLocationVerificationPolicy.js";

const VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate";
const REQUEST_TIMEOUT_MS = 8000;

const CLOUDINARY_UPLOAD_SEGMENT = "/image/upload/";
const VISION_IMAGE_TRANSFORM = "c_limit,w_1200,f_jpg,q_auto";
const CANDIDATE_DEDUPE_DISTANCE_METERS = 50;

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

function isHttpsUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCloudinaryUploadUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.includes(CLOUDINARY_UPLOAD_SEGMENT)
    );
  } catch {
    return false;
  }
}

function injectCloudinaryTransform(url, transform) {
  if (!isCloudinaryUploadUrl(url)) {
    return url;
  }

  return url.replace(CLOUDINARY_UPLOAD_SEGMENT, `${CLOUDINARY_UPLOAD_SEGMENT}${transform}/`);
}

function optimizeImageUrlForVision(imageUrl) {
  if (!isCloudinaryUploadUrl(imageUrl)) {
    return imageUrl;
  }

  return injectCloudinaryTransform(imageUrl, VISION_IMAGE_TRANSFORM);
}

function createVisionError(message, code, extra = {}) {
  const err = new Error(message);
  err.name = "VisionLandmarkError";
  err.code = code;

  for (const [key, value] of Object.entries(extra)) {
    err[key] = value;
  }

  return err;
}

function extractErrorMessageSample(data) {
  try {
    if (typeof data === "string") {
      return data.slice(0, 250);
    }

    return JSON.stringify(data).slice(0, 250);
  } catch {
    return null;
  }
}

function normalizeLandmarkCandidate(landmark) {
  if (!landmark || typeof landmark !== "object") {
    return null;
  }

  const firstLocation = Array.isArray(landmark.locations) ? landmark.locations[0] || null : null;
  const latLng = firstLocation?.latLng;

  return {
    name: normalizeOptionalText(landmark.description),
    score: toFiniteNumberOrNull(landmark.score),
    lat: toFiniteNumberOrNull(latLng?.latitude),
    lng: toFiniteNumberOrNull(latLng?.longitude)
  };
}

function isSameGeographicCandidate(a, b) {
  if (!a || !b) {
    return false;
  }

  if (!hasValidLatLng(a.lat, a.lng) || !hasValidLatLng(b.lat, b.lng)) {
    return false;
  }

  try {
    return (
      calculateHaversineDistanceMeters(a.lat, a.lng, b.lat, b.lng) <=
      CANDIDATE_DEDUPE_DISTANCE_METERS
    );
  } catch {
    return false;
  }
}

function isBetterCandidate(next, current) {
  const nextScore = Number.isFinite(next?.score) ? next.score : -1;
  const currentScore = Number.isFinite(current?.score) ? current.score : -1;

  if (nextScore !== currentScore) {
    return nextScore > currentScore;
  }

  const nextName = normalizeOptionalText(next?.name) || "";
  const currentName = normalizeOptionalText(current?.name) || "";

  return nextName.length > currentName.length;
}

function sortCandidatesByScoreDesc(candidates) {
  return [...candidates].sort((a, b) => {
    const scoreA = Number.isFinite(a?.score) ? a.score : -1;
    const scoreB = Number.isFinite(b?.score) ? b.score : -1;

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    const nameA = normalizeOptionalText(a?.name) || "";
    const nameB = normalizeOptionalText(b?.name) || "";
    return nameA.localeCompare(nameB);
  });
}

function dedupeCandidatesGeographically(candidates) {
  const deduped = [];

  for (const candidate of candidates) {
    let merged = false;

    for (let i = 0; i < deduped.length; i += 1) {
      if (isSameGeographicCandidate(candidate, deduped[i])) {
        if (isBetterCandidate(candidate, deduped[i])) {
          deduped[i] = candidate;
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      deduped.push(candidate);
    }
  }

  return sortCandidatesByScoreDesc(deduped);
}

function normalizeVisionResponse(data, imageUrlUsed) {
  const annotationResponse = data?.responses?.[0];
  if (!annotationResponse || typeof annotationResponse !== "object") {
    throw createVisionError("Vision API returned an invalid response body", "VISION_INVALID_BODY");
  }

  if (annotationResponse.error) {
    const message =
      normalizeOptionalText(annotationResponse.error.message) || "Vision API annotation error";

    throw createVisionError(message, "VISION_ANNOTATION_ERROR", {
      status: annotationResponse.error.code ?? null
    });
  }

  const rawCandidates = Array.isArray(annotationResponse.landmarkAnnotations)
    ? annotationResponse.landmarkAnnotations.map(normalizeLandmarkCandidate).filter(Boolean)
    : [];

  const candidates = dedupeCandidatesGeographically(rawCandidates);

  if (!candidates.length) {
    return {
      provider: DEFAULT_PHOTO_VERIFICATION_PROVIDER,
      imageUrlUsed,
      landmarkDetected: false,
      name: null,
      score: null,
      lat: null,
      lng: null,
      candidates: []
    };
  }

  const primary = candidates[0];

  return {
    provider: DEFAULT_PHOTO_VERIFICATION_PROVIDER,
    imageUrlUsed,
    landmarkDetected: true,
    name: primary.name,
    score: primary.score,
    lat: primary.lat,
    lng: primary.lng,
    candidates
  };
}

export async function detectLandmarkFromImageUrl(imageUrl) {
  if (!ENV.GOOGLE_VISION_API_KEY) {
    throw createVisionError("GOOGLE_VISION_API_KEY is not configured", "VISION_MISSING_API_KEY");
  }

  if (!isHttpsUrl(imageUrl)) {
    throw createVisionError(
      "Vision landmark detection requires a valid https image URL",
      "VISION_INVALID_IMAGE_URL"
    );
  }

  const optimizedImageUrl = optimizeImageUrlForVision(imageUrl);

  const payload = {
    requests: [
      {
        image: {
          source: {
            imageUri: optimizedImageUrl
          }
        },
        features: [
          {
            type: "LANDMARK_DETECTION",
            maxResults: 3
          }
        ]
      }
    ]
  };

  let response;
  try {
    response = await axios.post(VISION_ANNOTATE_URL, payload, {
      params: {
        key: ENV.GOOGLE_VISION_API_KEY
      },
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json"
      },
      validateStatus: () => true
    });
  } catch (err) {
    if (err?.code === "ECONNABORTED") {
      throw createVisionError("Vision API request timed out", "VISION_TIMEOUT");
    }

    throw createVisionError("Vision API network error", "VISION_NETWORK_ERROR");
  }

  if (response.status < 200 || response.status >= 300) {
    throw createVisionError("Vision API returned a non-2xx response", "VISION_HTTP_ERROR", {
      status: response.status,
      bodySample: extractErrorMessageSample(response.data)
    });
  }

  return normalizeVisionResponse(response.data, optimizedImageUrl);
}