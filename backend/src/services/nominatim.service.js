// backend/src/services/nominatim.service.js
import axios from "axios";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const BASE_URL = ENV.NOMINATIM_BASE_URL;

function isUpstreamUnavailable(status) {
  return status === 503 || status === 504;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  // Extra safety: should already be guaranteed by env validation
  if (!ENV.NOMINATIM_USER_AGENT || !ENV.NOMINATIM_USER_AGENT.trim()) {
    throw new HttpError(500, "Server misconfiguration: NOMINATIM_USER_AGENT is missing");
  }

  try {
    const res = await axios.get(`${BASE_URL}${path}`, {
      params,
      timeout: 8000,
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
      // Preserve real upstream status (503 or 504)
      throw new HttpError(status, "Geocoding service unavailable");
    }

    // Any other upstream HTTP error (403/429/400/500 etc.)
    throw new HttpError(502, "Geocoding upstream error");
  } catch (err) {
    if (err instanceof HttpError) throw err;

    // Timeout
    if (err?.code === "ECONNABORTED") {
      throw new HttpError(504, "Geocoding timed out");
    }

    // DNS / network / unexpected
    throw new HttpError(502, "Geocoding network error");
  }
}

export async function forwardGeocode(query) {
  try {
    return await nominatimGet("/search", {
      q: query,
      format: "json",
      addressdetails: 1,
      limit: 5
    });
  } catch (err) {
    // Retry once on 503/504
    if (err?.statusCode === 503 || err?.statusCode === 504) {
      await sleep(1000);
      return await nominatimGet("/search", {
        q: query,
        format: "json",
        addressdetails: 1,
        limit: 5
      });
    }
    throw err;
  }
}

export async function reverseGeocode(lat, lng) {
  try {
    return await nominatimGet("/reverse", {
      lat,
      lon: lng,
      format: "json",
      addressdetails: 1,
      zoom: 18
    });
  } catch (err) {
    // Retry once on 503/504
    if (err?.statusCode === 503 || err?.statusCode === 504) {
      await sleep(1000);
      return await nominatimGet("/reverse", {
        lat,
        lon: lng,
        format: "json",
        addressdetails: 1,
        zoom: 18
      });
    }
    throw err;
  }
}