// backend/src/utils/mapNominatim.js

function pickCity(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state ||
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

function pickLocationName(address = {}, displayName) {
  const primary =
    address.attraction ||
    address.building ||
    address.road ||
    address.neighbourhood ||
    address.suburb ||
    address.city ||
    address.town ||
    address.village ||
    null;

  if (primary) return primary;

  if (displayName) {
    const first = displayName.split(",")[0]?.trim();
    return first || null;
  }

  return null;
}

export function mapNominatimSearchItem(item) {
  if (!item || typeof item !== "object") return null;

  const lat = toNumberOrNull(item.lat);
  const lng = toNumberOrNull(item.lon);
  if (lat === null || lng === null) return null;

  const address = item.address || {};
  const city = pickCity(address);
  const country = address.country || null;
  const displayName = typeof item.display_name === "string" ? item.display_name : null;

  const locationName = pickLocationName(address, displayName);
  if (!locationName) return null;

  return { lat, lng, locationName, city, country, displayName };
}

export function mapNominatimSearchResults(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.error) return [];
  if (!Array.isArray(raw)) return [];
  return raw.map(mapNominatimSearchItem).filter(Boolean).slice(0, 5);
}

export function mapNominatimReverseResult(raw, reqLat, reqLng) {
  if (!raw || typeof raw !== "object") return null;

  if (typeof raw.error === "string" && raw.error.trim()) {
    return {
      lat: reqLat,
      lng: reqLng,
      locationName: "Unknown location (Ocean/Remote)",
      city: null,
      country: null,
      displayName: raw.error.trim()
    };
  }

  const lat = toNumberOrNull(raw.lat);
  const lng = toNumberOrNull(raw.lon);

  if (lat === null || lng === null) {
    return {
      lat: reqLat,
      lng: reqLng,
      locationName: "Unknown location",
      city: null,
      country: null,
      displayName: "Unknown location"
    };
  }

  const address = raw.address || {};
  const city = pickCity(address);
  const country = address.country || null;
  const displayName = typeof raw.display_name === "string" ? raw.display_name : null;

  const locationName = pickLocationName(address, displayName) || "Unknown location";

  return { lat, lng, locationName, city, country, displayName };
}