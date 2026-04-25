// backend/src/services/nominatim.service.js
import axios from "axios";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const BASE_URL = ENV.NOMINATIM_BASE_URL;
const REQUEST_TIMEOUT_MS = 4000;
const RETRY_DELAY_MS = 1000;

function isUpstreamUnavailable(status) {
  return status === 503 || status === 504;
}

function shouldRetryNominatimError(err) {
  const status = err?.statusCode ?? err?.status ?? null;
  return status === 503 || status === 504 || err?.code === "ECONNABORTED";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function devLogNon2xx(status, data) {
  if (ENV.NODE_ENV !== "development") return;

  let sample;
  try {
    sample =
      typeof data === "string" ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250);
  } catch {
    sample = String(data).slice(0, 250);
  }

  console.warn(`[nominatim] upstream non-2xx: ${status} body(sample): ${sample}`);
}

async function nominatimGet(path, params) {
  if (!ENV.NOMINATIM_USER_AGENT || !ENV.NOMINATIM_USER_AGENT.trim()) {
    throw new HttpError(500, "Server misconfiguration: NOMINATIM_USER_AGENT is missing");
  }

  try {
    const res = await axios.get(`${BASE_URL}${path}`, {
      params,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "User-Agent": ENV.NOMINATIM_USER_AGENT,
        Accept: "application/json"
      },
      validateStatus: () => true
    });

    const status = res.status;

    if (status >= 200 && status < 300) {
      return res.data;
    }

    devLogNon2xx(status, res.data);

    if (isUpstreamUnavailable(status)) {
      throw new HttpError(status, "Geocoding service unavailable");
    }

    throw new HttpError(502, "Geocoding upstream error");
  } catch (err) {
    if (err instanceof HttpError) throw err;

    if (err?.code === "ECONNABORTED") {
      throw new HttpError(504, "Geocoding timed out");
    }

    throw new HttpError(502, "Geocoding network error");
  }
}

async function getWithSingleRetry(path, params) {
  try {
    return await nominatimGet(path, params);
  } catch (err) {
    if (shouldRetryNominatimError(err)) {
      await sleep(RETRY_DELAY_MS);
      return await nominatimGet(path, params);
    }

    throw err;
  }
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildEnrichmentQuery(locationName, city, queryOverride = null) {
  const baseLabel =
    typeof queryOverride === "string" && queryOverride.trim()
      ? queryOverride.trim()
      : typeof locationName === "string"
        ? locationName.trim()
        : "";

  const safeCity = typeof city === "string" ? city.trim() : "";
  const parts = [baseLabel, safeCity].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
}

export async function forwardGeocode(query) {
  return await getWithSingleRetry("/search", {
    q: query,
    format: "json",
    addressdetails: 1,
    limit: 5
  });
}

export async function reverseGeocode(lat, lng) {
  return await getWithSingleRetry("/reverse", {
    lat,
    lon: lng,
    format: "json",
    addressdetails: 1,
    zoom: 18
  });
}

export async function searchPlacesForEnrichment(locationName, city, options = {}) {
  const query = buildEnrichmentQuery(locationName, city, options?.queryOverride ?? null);
  if (!query) {
    return [];
  }

  const limit = normalizePositiveInt(options?.limit, 5);

  return await getWithSingleRetry("/search", {
    q: query,
    format: "json",
    addressdetails: 1,
    limit
  });
}

// Existing helper kept for current classification flow.
export async function searchPlaceForEnrichment(locationName, city) {
  return await searchPlacesForEnrichment(locationName, city, { limit: 1 });
}