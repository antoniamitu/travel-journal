// backend/src/utils/photoLocationEligibility.js

import { hasValidLatLng } from "./geoDistance.js";

const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;
const MULTISPACE_RE = /\s+/g;

/**
 * IMPORTANT:
 * This allowlist is intentionally narrower than classifyPlaceCategory().
 * A place may be classified nicely in the product UI and still remain
 * ineligible for photo-location verification.
 */
const ELIGIBLE_OSM_TYPES = new Map([
  [
    "historic",
    new Set([
      "archaeological_site",
      "castle",
      "church",
      "fort",
      "memorial",
      "monastery",
      "monument",
      "mosque",
      "ruins",
      "temple",
      "tower"
    ])
  ],
  ["tourism", new Set(["attraction", "gallery", "museum"])],
  ["amenity", new Set(["clock", "museum", "place_of_worship", "theatre", "theater"])],
  [
    "building",
    new Set([
      "bridge",
      "castle",
      "cathedral",
      "chapel",
      "church",
      "clock_tower",
      "monastery",
      "mosque",
      "museum",
      "palace",
      "synagogue",
      "temple",
      "tower",
      "triumphal_arch"
    ])
  ],
  ["man_made", new Set(["bridge", "tower", "water_tower", "windmill"])]
]);

const GENERIC_ADDRESS_TYPES = new Set([
  "administrative",
  "city",
  "country",
  "county",
  "house_number",
  "municipality",
  "neighbourhood",
  "neighborhood",
  "path",
  "pedestrian",
  "postcode",
  "quarter",
  "residential",
  "road",
  "state",
  "suburb",
  "town",
  "village"
]);

const GENERIC_LOCATION_LABELS = new Set([
  "ocean",
  "remote location",
  "unknown location",
  "unknown location ocean remote"
]);

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

function normalizeSearchText(value) {
  const raw = normalizeOptionalText(value);
  if (!raw) {
    return "";
  }

  return raw
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RE, " ")
    .replace(MULTISPACE_RE, " ")
    .trim();
}

function normalizeOsmToken(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.replace(/\s+/g, "_") : null;
}

function isClearlyGenericLocationLabel(locationName) {
  const normalized = normalizeSearchText(locationName);
  if (!normalized) {
    return true;
  }

  return GENERIC_LOCATION_LABELS.has(normalized);
}

function buildNormalizedLocation(input = {}) {
  const latitude = toFiniteNumberOrNull(input.latitude ?? input.lat);
  const longitude = toFiniteNumberOrNull(input.longitude ?? input.lng);

  return {
    latitude,
    longitude,
    locationName: normalizeOptionalText(input.locationName ?? input.location_name),
    displayName: normalizeOptionalText(input.displayName ?? input.display_name),
    city: normalizeOptionalText(input.city),
    country: normalizeOptionalText(input.country),
    osmClass: normalizeOsmToken(input.osmClass ?? input.osm_class),
    osmSubtype: normalizeOsmToken(input.osmSubtype ?? input.osm_subtype),
    addressType: normalizeOsmToken(input.addressType ?? input.address_type)
  };
}

export function isEligiblePhotoLocationOsmType(input = {}) {
  const normalized = buildNormalizedLocation(input);

  const allowedSubtypes = normalized.osmClass
    ? ELIGIBLE_OSM_TYPES.get(normalized.osmClass)
    : null;

  return (
    !!allowedSubtypes &&
    !!normalized.osmSubtype &&
    allowedSubtypes.has(normalized.osmSubtype)
  );
}

export function isGenericPhotoLocationAddressType(value) {
  const normalized = normalizeOsmToken(value);
  return !!normalized && GENERIC_ADDRESS_TYPES.has(normalized);
}

export function getPhotoLocationEligibility(input = {}) {
  const normalized = buildNormalizedLocation(input);

  if (!hasValidLatLng(normalized.latitude, normalized.longitude)) {
    return {
      shouldCheck: false,
      reasons: ["missing_location_coordinates"],
      normalized
    };
  }

  if (!normalized.locationName || isClearlyGenericLocationLabel(normalized.locationName)) {
    return {
      shouldCheck: false,
      reasons: ["missing_or_generic_location_name"],
      normalized
    };
  }

    const isAllowed = isEligiblePhotoLocationOsmType({
    osmClass: normalized.osmClass,
    osmSubtype: normalized.osmSubtype
  });

  if (!isAllowed) {
    if (normalized.addressType && GENERIC_ADDRESS_TYPES.has(normalized.addressType)) {
      return {
        shouldCheck: false,
        reasons: ["generic_address_type"],
        normalized
      };
    }

    return {
      shouldCheck: false,
      reasons: ["ineligible_osm_type"],
      normalized
    };
  }

  return {
    shouldCheck: true,
    reasons: ["eligible_location"],
    normalized
  };
}