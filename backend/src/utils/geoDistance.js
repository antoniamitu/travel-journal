// backend/src/utils/geoDistance.js

const EARTH_RADIUS_METERS = 6_371_008.8;

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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function hasValidLatitude(value) {
  const n = toFiniteNumberOrNull(value);
  return n !== null && n >= -90 && n <= 90;
}

export function hasValidLongitude(value) {
  const n = toFiniteNumberOrNull(value);
  return n !== null && n >= -180 && n <= 180;
}

export function hasValidLatLng(lat, lng) {
  return hasValidLatitude(lat) && hasValidLongitude(lng);
}

export function calculateHaversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const aLat = toFiniteNumberOrNull(lat1);
  const aLng = toFiniteNumberOrNull(lng1);
  const bLat = toFiniteNumberOrNull(lat2);
  const bLng = toFiniteNumberOrNull(lng2);

  if (!hasValidLatLng(aLat, aLng) || !hasValidLatLng(bLat, bLng)) {
    throw new Error("calculateHaversineDistanceMeters requires valid latitude/longitude pairs");
  }

  if (aLat === bLat && aLng === bLng) {
    return 0;
  }

  const phi1 = toRadians(aLat);
  const phi2 = toRadians(bLat);
  const deltaPhi = toRadians(bLat - aLat);
  const deltaLambda = toRadians(bLng - aLng);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_METERS * centralAngle;

  return Math.round(distance);
}