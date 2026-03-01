// backend/src/utils/geocodeRateLimit.js
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

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
    if (pruneOld(v, now).length === 0) {
      hits.delete(k);
    }
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