// backend/src/utils/geocodeRateLimit.js
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

/**
 * NOTE:
 * In-memory, single-process rate limiter.
 * Works for one Node instance (e.g., Render free tier single instance).
 * If you scale horizontally or restart the process, counters reset/split.
 * For multi-instance correctness, move this to Redis or DB-based limiting.
 */

// key -> array of timestamps
const hits = new Map();

function pruneOld(timestamps, now) {
  const cutoff = now - WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

// Garbage-collection in background
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits.entries()) {
    const pruned = pruneOld(v, now);
    if (pruned.length === 0) hits.delete(k);
    else hits.set(k, pruned);
  }
}, WINDOW_MS).unref();

export function checkGeocodeLimit(userId, ip) {
  const now = Date.now();

  const key =
    Number.isInteger(userId) && userId > 0
      ? `user:${userId}`
      : `ip:${ip || "unknown"}`;

  const prev = hits.get(key) || [];
  const pruned = pruneOld(prev, now);

  if (pruned.length >= MAX_PER_WINDOW) {
    hits.set(key, pruned);
    return { ok: false, retryAfterMs: pruned[0] + WINDOW_MS - now };
  }

  pruned.push(now);
  hits.set(key, pruned);

  return { ok: true, retryAfterMs: 0 };
}