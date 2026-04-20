// backend/src/services/visionLandmark.service.js

import axios from "axios";
import { ENV } from "../config/env.js";
import { DEFAULT_PHOTO_VERIFICATION_PROVIDER } from "../utils/photoLocationVerificationPolicy.js";

const VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate";
const REQUEST_TIMEOUT_MS = 8000;

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

function normalizeVisionResponse(data) {
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

  const landmark = Array.isArray(annotationResponse.landmarkAnnotations)
    ? annotationResponse.landmarkAnnotations[0] || null
    : null;

  if (!landmark) {
    return {
      provider: DEFAULT_PHOTO_VERIFICATION_PROVIDER,
      landmarkDetected: false,
      name: null,
      score: null,
      lat: null,
      lng: null
    };
  }

  const firstLocation = Array.isArray(landmark.locations) ? landmark.locations[0] || null : null;
  const latLng = firstLocation?.latLng;

  return {
    provider: DEFAULT_PHOTO_VERIFICATION_PROVIDER,
    landmarkDetected: true,
    name: normalizeOptionalText(landmark.description),
    score: toFiniteNumberOrNull(landmark.score),
    lat: toFiniteNumberOrNull(latLng?.latitude),
    lng: toFiniteNumberOrNull(latLng?.longitude)
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

  const payload = {
    requests: [
      {
        image: {
          source: {
            imageUri: imageUrl
          }
        },
        features: [
          {
            type: "LANDMARK_DETECTION",
            maxResults: 1
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

  return normalizeVisionResponse(response.data);
}