// backend/src/services/textLocationConsistency.service.js
import { ENV } from "../config/env.js";
import { calculateHaversineDistanceMeters, hasValidLatLng } from "../utils/geoDistance.js";
import { mapNominatimSearchResults } from "../utils/mapNominatim.js";
import { generateGeminiText } from "./ai.service.js";
import { searchPlacesForEnrichment } from "./nominatim.service.js";
import { canEnqueue, nominatimQueue } from "./nominatimQueue.js";

const MAX_TITLE_CHARS = 120;
const MAX_CONTENT_CHARS = 1200;
const MAX_NOMINATIM_RESULTS = 5;

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function toFiniteNumberOrNull(value) {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfidence(value) {
  const parsed = toFiniteNumberOrNull(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }

  return parsed;
}

function buildSelectedLocation(input = {}) {
  return {
    lat: toFiniteNumberOrNull(input.lat ?? input.latitude),
    lng: toFiniteNumberOrNull(input.lng ?? input.longitude),
    locationName: normalizeOptionalText(input.locationName ?? input.location_name),
    city: normalizeOptionalText(input.city),
    country: normalizeOptionalText(input.country),
    displayName: normalizeOptionalText(input.displayName ?? input.display_name)
  };
}

function buildSelectedLocationLabel(selectedLocation) {
  return (
    selectedLocation.locationName ||
    selectedLocation.displayName ||
    [selectedLocation.city, selectedLocation.country].filter(Boolean).join(", ") ||
    "selected location"
  );
}

function buildExtractionPrompt({ title, content }) {
  const safeTitle = sanitizeText(title, MAX_TITLE_CHARS);
  const safeContent = sanitizeText(content, MAX_CONTENT_CHARS);

  return [
    "You extract the primary real-world place from a travel journal post.",
    "",
    "Task:",
    "Identify the single primary real-world place that the post is mainly about.",
    "",
    "Important rules:",
    "- Return only valid JSON. No markdown. No code fences.",
    "- Do not return places that are only comparisons, memories, past trips, negations, or secondary references.",
    "- If the post mentions multiple places, return the place that is the main subject of the current post.",
    "- If there is no clear primary place, return null values and a low confidence.",
    "- The text may be in English, Romanian, or another common language.",
    "",
    "Return exactly this JSON shape:",
    '{ "place": string|null, "city": string|null, "country": string|null, "confidence": number, "reason": string }',
    "",
    `Title: ${safeTitle || "(empty)"}`,
    `Description: ${safeContent || "(empty)"}`
  ].join("\n");
}

function extractJsonObject(text) {
  if (typeof text !== "string") return null;

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonSlice);
  } catch {
    return null;
  }
}

function normalizeExtraction(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const place = normalizeOptionalText(raw.place);
  const city = normalizeOptionalText(raw.city);
  const country = normalizeOptionalText(raw.country);
  const confidence = normalizeConfidence(raw.confidence);
  const reason = normalizeOptionalText(raw.reason);

  const primaryLocation = place || city;

  if (!primaryLocation || confidence === null) {
    return null;
  }

  if (confidence < ENV.TEXT_LOCATION_EXTRACT_MIN_CONFIDENCE) {
    return null;
  }

  return {
    place: primaryLocation,
    city: place ? city : null,
    country,
    confidence,
    reason
  };
}

function buildGeocodeQuery(extraction) {
  return [extraction.place, extraction.city, extraction.country].filter(Boolean).join(", ");
}

function pickFirstMappedPlaceWithCoordinates(mappedPlaces) {
  return mappedPlaces.find((place) => hasValidLatLng(place?.lat, place?.lng)) || null;
}

async function resolveExtractedLocation(extraction) {
  if (!canEnqueue()) {
    return {
      place: null,
      skippedReason: "queue_busy"
    };
  }

  const queryOverride = buildGeocodeQuery(extraction);

  const raw = await nominatimQueue.add(() =>
    searchPlacesForEnrichment(extraction.place, extraction.city, {
      queryOverride,
      limit: MAX_NOMINATIM_RESULTS
    })
  );

  const mappedPlaces = mapNominatimSearchResults(raw);

  return {
    place: pickFirstMappedPlaceWithCoordinates(mappedPlaces),
    skippedReason: null
  };
}

export async function checkTextLocationConsistencyForPost(input = {}, { logContext = {} } = {}) {
  if (!ENV.TEXT_LOCATION_CONSISTENCY_ENABLED) {
    return {
      ok: true,
      skippedReason: "feature_disabled"
    };
  }

  const title = sanitizeText(input.title, MAX_TITLE_CHARS);
  const content = sanitizeText(input.content, MAX_CONTENT_CHARS);

  if (!title && !content) {
    return {
      ok: true,
      skippedReason: "empty_text"
    };
  }

  const selectedLocation = buildSelectedLocation(input.selectedLocation);

  if (!hasValidLatLng(selectedLocation.lat, selectedLocation.lng)) {
    return {
      ok: true,
      skippedReason: "invalid_selected_location"
    };
  }

  let extraction;

  try {
    const prompt = buildExtractionPrompt({ title, content });
    const geminiText = await generateGeminiText(prompt);
    extraction = normalizeExtraction(extractJsonObject(geminiText));
  } catch (err) {
    console.warn("Text-location extraction failed; continuing without blocking", {
      ...logContext,
      error: err?.message || String(err),
      status: err?.statusCode ?? err?.status ?? null
    });

    return {
      ok: true,
      skippedReason: "extractor_error"
    };
  }

  if (!extraction) {
    return {
      ok: true,
      skippedReason: "no_clear_primary_text_location"
    };
  }

  let extractedPlaceResult;

  try {
    extractedPlaceResult = await resolveExtractedLocation(extraction);
  } catch (err) {
    console.warn("Text-location geocoding failed; continuing without blocking", {
      ...logContext,
      extractedPlace: extraction.place,
      extractedCity: extraction.city,
      extractedCountry: extraction.country,
      error: err?.message || String(err),
      status: err?.statusCode ?? err?.status ?? null
    });

    return {
      ok: true,
      skippedReason: "geocoding_error",
      extractedLocation: extraction
    };
  }

  if (extractedPlaceResult?.skippedReason === "queue_busy") {
    return {
      ok: true,
      skippedReason: "queue_busy",
      extractedLocation: extraction
    };
  }

  const extractedPlace = extractedPlaceResult?.place || null;

  if (!extractedPlace) {
    return {
      ok: true,
      skippedReason: "extracted_location_not_geocoded",
      extractedLocation: extraction
    };
  }

  let distanceMeters;

  try {
    distanceMeters = calculateHaversineDistanceMeters(
      selectedLocation.lat,
      selectedLocation.lng,
      extractedPlace.lat,
      extractedPlace.lng
    );
  } catch {
    return {
      ok: true,
      skippedReason: "distance_calculation_failed",
      extractedLocation: extraction
    };
  }

  const roundedDistanceMeters = Math.round(distanceMeters);

  if (
    Number.isFinite(distanceMeters) &&
    distanceMeters >= ENV.TEXT_LOCATION_MISMATCH_MIN_DISTANCE_METERS
  ) {
    return {
      ok: false,
      code: "TEXT_LOCATION_MISMATCH",
      mentionedLocation: extraction.place,
      selectedLocation: buildSelectedLocationLabel(selectedLocation),
      confidence: extraction.confidence,
      distanceMeters: roundedDistanceMeters,
      reason: "text_primary_location_far_from_selected_location",
      extractedLocation: {
        place: extraction.place,
        city: extraction.city,
        country: extraction.country,
        resolvedLocationName: extractedPlace.locationName,
        resolvedDisplayName: extractedPlace.displayName,
        lat: extractedPlace.lat,
        lng: extractedPlace.lng
      }
    };
  }

  return {
    ok: true,
    skippedReason: "distance_within_threshold",
    extractedLocation: extraction,
    distanceMeters: roundedDistanceMeters
  };
}