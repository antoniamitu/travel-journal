// backend/src/services/ai.service.js
import axios from "axios";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_API_KEY = ENV.GEMINI_API_KEY;
const GEMINI_MODEL = ENV.GEMINI_MODEL;

const AI_CACHE_TTL_MS = ENV.AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const AI_UPSTREAM_TIMEOUT_MS = ENV.AI_UPSTREAM_TIMEOUT_MS;
const AI_RETRY_ATTEMPTS = ENV.AI_RETRY_ATTEMPTS;
const AI_RETRY_BASE_DELAY_MS = ENV.AI_RETRY_BASE_DELAY_MS;
const CLEANUP_INTERVAL_MS = 60_000;

let lastCleanupAtMs = 0;

/**
 * location_key -> Promise<{ source: "cache" | "gemini", content: string }>
 * Prevents duplicate upstream calls for the same location while one request is already in flight.
 */
const pendingGenerations = new Map();

const fixNegZero = (n) => (Object.is(n, -0) ? 0 : n);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeKeySegment(value) {
  return sanitizeText(value, 100).replace(/[_ ,]/g, "");
}

function buildLocationKey(latitude, longitude, city, country) {
  const lat = fixNegZero(latitude).toFixed(3);
  const lng = fixNegZero(longitude).toFixed(3);

  const cityPart = normalizeKeySegment(city);
  const countryPart = normalizeKeySegment(country);

  return `${lat},${lng}_${cityPart}_${countryPart}`;
}

function buildPrompt({ locationName, city, country }) {
  const safeLocationName = sanitizeText(locationName, 500);
  const safeCity = sanitizeText(city, 100);
  const safeCountry = sanitizeText(country, 100);

  const contextBits = [];
  if (safeCity) contextBits.push(`City: ${safeCity}`);
  if (safeCountry) contextBits.push(`Country: ${safeCountry}`);

  const contextLine = contextBits.length > 0 ? contextBits.join("\n") : "City/Country: not specified";

  return [
    "You are writing a short, factual, traveler-friendly note for a travel journal app.",
    "Explain why this place matters to a visitor, focusing on history, culture, architecture, atmosphere, or a memorable local curiosity.",
    "",
    `Location name: ${safeLocationName}`,
    contextLine,
    "",
    "Rules:",
    "- Write exactly 2 short paragraphs.",
    "- Keep the answer between 120 and 220 words.",
    "- Be informative but warm and easy to read.",
    "- Avoid bullet points, markdown, headings, emojis, and lists.",
    "- Do not mention that you are an AI.",
    "- Do not invent highly specific facts if the place is ambiguous; stay accurate and slightly more general when needed."
  ].join("\n");
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function normalizeGeneratedContent(text) {
  if (typeof text !== "string") return "";

  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  console.warn(`[ai] upstream non-2xx: ${status} body(sample): ${sample}`);
}

function getCacheCutoffDate() {
  return new Date(Date.now() - AI_CACHE_TTL_MS);
}

async function cleanupExpiredAiCache(prisma, cutoff) {
  const now = Date.now();
  if (now - lastCleanupAtMs < CLEANUP_INTERVAL_MS) return;

  lastCleanupAtMs = now;

  try {
    await prisma.aiContentCache.deleteMany({
      where: {
        created_at: { lt: cutoff }
      }
    });
  } catch (err) {
    console.warn("[ai] cache cleanup failed:", err?.message || err);
  }
}

async function findFreshCache(prisma, locationKey, cutoff) {
  const cached = await prisma.aiContentCache.findUnique({
    where: { location_key: locationKey },
    select: {
      content: true,
      created_at: true
    }
  });

  if (!cached) return null;
  if (!(cached.created_at instanceof Date)) return null;
  if (cached.created_at < cutoff) return null;

  return cached;
}

async function requestGeminiOnce(prompt) {
  const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  try {
    const res = await axios.post(
      url,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      },
      {
        timeout: AI_UPSTREAM_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        validateStatus: () => true
      }
    );

    if (res.status >= 200 && res.status < 300) {
      const text = normalizeGeneratedContent(extractGeminiText(res.data));

      if (!text) {
        throw new HttpError(503, "AI service returned an empty response");
      }

      return text;
    }

    devLogNon2xx(res.status, res.data);

    if (res.status === 429) {
      throw new HttpError(429, "AI service is busy right now. Please try again in a moment.");
    }

    if (res.status >= 500) {
      throw new HttpError(503, "AI service temporarily unavailable");
    }

    throw new HttpError(502, "AI upstream error");
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }

    if (err?.code === "ECONNABORTED") {
      throw new HttpError(504, "AI service timed out");
    }

    throw new HttpError(502, "AI network error");
  }
}

function shouldRetry(err) {
  return err?.statusCode === 429 || err?.statusCode === 503 || err?.statusCode === 504;
}

async function generateLocationContent(prompt) {
  let lastErr;

  for (let attempt = 0; attempt < AI_RETRY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      const delay = AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      if (delay > 0) {
        await sleep(delay);
      }
    }

    try {
      return await requestGeminiOnce(prompt);
    } catch (err) {
      lastErr = err;

      if (!shouldRetry(err) || attempt === AI_RETRY_ATTEMPTS - 1) {
        throw err;
      }
    }
  }

  throw lastErr || new HttpError(503, "AI service temporarily unavailable");
}

async function withPendingGeneration(locationKey, factory) {
  const existing = pendingGenerations.get(locationKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      return await factory();
    } finally {
      pendingGenerations.delete(locationKey);
    }
  })();

  pendingGenerations.set(locationKey, promise);
  return promise;
}

export async function getLearnMoreContent(prisma, input) {
  const latitude = fixNegZero(input.latitude);
  const longitude = fixNegZero(input.longitude);

  const locationKey = buildLocationKey(latitude, longitude, input.city, input.country);
  const cutoff = getCacheCutoffDate();

  await cleanupExpiredAiCache(prisma, cutoff);

  const cached = await findFreshCache(prisma, locationKey, cutoff);
  if (cached) {
    return {
      source: "cache",
      content: cached.content
    };
  }

  return withPendingGeneration(locationKey, async () => {
    const cachedAgain = await findFreshCache(prisma, locationKey, cutoff);
    if (cachedAgain) {
      return {
        source: "cache",
        content: cachedAgain.content
      };
    }

    const prompt = buildPrompt(input);
    const content = await generateLocationContent(prompt);

    await prisma.aiContentCache.upsert({
      where: {
        location_key: locationKey
      },
      create: {
        location_key: locationKey,
        content
      },
      update: {
        content,
        created_at: new Date()
      }
    });

    return {
      source: "gemini",
      content
    };
  });
}