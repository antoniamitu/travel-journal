// backend/src/utils/mapNominatim.js
import { normalizeCityForStorage, normalizeCountryForStorage } from "./locationText.js";

function pickCity(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    null
  );
}

function toNumberOrNull(v) {
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPositiveIntegerOrNull(v) {
  if (typeof v === "string") {
    const s = v.trim();
    if (!/^\d+$/.test(s)) return null;

    const n = Number(s);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  if (Number.isSafeInteger(v) && v > 0) {
    return v;
  }

  return null;
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function pickFirstDisplaySegment(displayName) {
  const normalizedDisplayName = normalizeOptionalText(displayName);
  if (!normalizedDisplayName) return null;

  const first = normalizedDisplayName.split(",")[0]?.trim();
  return first || null;
}

function pickLocationName(address = {}, displayName, exactName = null) {
  const normalizedExactName = normalizeOptionalText(exactName);
  if (normalizedExactName) {
    return normalizedExactName;
  }

  const displayFirst = pickFirstDisplaySegment(displayName);
  if (displayFirst) {
    return displayFirst;
  }

  const primary =
    normalizeOptionalText(address.attraction) ||
    normalizeOptionalText(address.building) ||
    normalizeOptionalText(address.road) ||
    normalizeOptionalText(address.neighbourhood) ||
    normalizeOptionalText(address.suburb) ||
    normalizeOptionalText(address.city) ||
    normalizeOptionalText(address.town) ||
    normalizeOptionalText(address.village) ||
    null;

  if (primary) {
    return primary;
  }

  return null;
}

function buildMappedResult(
  item,
  { fallbackLat = null, fallbackLng = null, unknownLabel = null } = {}
) {
  if (!item || typeof item !== "object") return null;

  const lat = toNumberOrNull(item.lat);
  const lng = toNumberOrNull(item.lon);

  const safeFallbackLat = toNumberOrNull(fallbackLat);
  const safeFallbackLng = toNumberOrNull(fallbackLng);

  const finalLat = lat ?? safeFallbackLat;
  const finalLng = lng ?? safeFallbackLng;

  if (finalLat === null || finalLng === null) {
    return null;
  }

  const address = item.address && typeof item.address === "object" ? item.address : {};

  const city = normalizeCityForStorage(pickCity(address)) ?? null;
  const country = normalizeCountryForStorage(address.country) ?? null;
  const displayName = normalizeOptionalText(item.display_name);
  const exactName = normalizeOptionalText(item.name);

  const locationName =
    pickLocationName(address, displayName, exactName) || normalizeOptionalText(unknownLabel);

  if (!locationName) {
    return null;
  }

  return {
    lat: finalLat,
    lng: finalLng,
    locationName,
    city,
    country,
    displayName,
    osmClass: normalizeOptionalText(item.class) || normalizeOptionalText(item.category),
    osmSubtype: normalizeOptionalText(item.type),
    addressType: normalizeOptionalText(item.addresstype),

    // Useful for frontend/debugging, even if we do not persist them in DB yet.
    osmType: normalizeOptionalText(item.osm_type),
    osmId: toPositiveIntegerOrNull(item.osm_id)
  };
}

export function mapNominatimSearchItem(item) {
  return buildMappedResult(item);
}

export function mapNominatimSearchResults(raw, { limit = 5 } = {}) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.error) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 5;

  return raw.map(mapNominatimSearchItem).filter(Boolean).slice(0, safeLimit);
}

export function mapNominatimReverseResult(raw, reqLat, reqLng) {
  if (!raw || typeof raw !== "object") return null;

  const safeReqLat = toNumberOrNull(reqLat);
  const safeReqLng = toNumberOrNull(reqLng);

  if (safeReqLat === null || safeReqLng === null) {
    return null;
  }

  if (typeof raw.error === "string" && raw.error.trim()) {
    return {
      lat: safeReqLat,
      lng: safeReqLng,
      locationName: "Unknown location (Ocean/Remote)",
      city: null,
      country: null,
      displayName: raw.error.trim(),
      osmClass: null,
      osmSubtype: null,
      addressType: null,
      osmType: null,
      osmId: null
    };
  }

  const mapped = buildMappedResult(raw, {
    fallbackLat: safeReqLat,
    fallbackLng: safeReqLng,
    unknownLabel: "Unknown location"
  });

  if (mapped) {
    return mapped;
  }

  return {
    lat: safeReqLat,
    lng: safeReqLng,
    locationName: "Unknown location",
    city: null,
    country: null,
    displayName: "Unknown location",
    osmClass: null,
    osmSubtype: null,
    addressType: null,
    osmType: null,
    osmId: null
  };
}