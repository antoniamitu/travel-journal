// backend/src/utils/slidingWindowRateLimiter.js
/**
 * Sliding-window in-memory rate limiter (single-process).
 *
 * NOTE:
 * - Works for one Node instance.
 * - If you scale horizontally or restart the process, counters reset/split.
 * - For multi-instance correctness, move this to Redis or DB-based limiting.
 */

export function setRetryAfterHeader(res, retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  res.set("Retry-After", String(seconds));
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function createSlidingWindowRateLimiter(windowMs) {
  const w = normalizePositiveNumber(windowMs, NaN);
  if (!Number.isFinite(w)) {
    throw new Error("createSlidingWindowRateLimiter: windowMs must be a positive number");
  }

  const hits = new Map();

  function pruneOld(timestamps, now) {
    const cutoff = now - w;
    return timestamps.filter((t) => t > cutoff);
  }

  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const pruned = pruneOld(timestamps, now);
      if (pruned.length === 0) hits.delete(key);
      else hits.set(key, pruned);
    }
  }, w).unref();

  function check(key, maxPerWindow) {
    const now = Date.now();
    const k = typeof key === "string" && key.trim() ? key : "unknown";
    const max = Math.floor(normalizePositiveNumber(maxPerWindow, 10));

    const prev = hits.get(k) || [];
    const pruned = pruneOld(prev, now);

    if (pruned.length >= max) {
      if (pruned.length === 0) hits.delete(k);
      else hits.set(k, pruned);

      return {
        ok: false,
        retryAfterMs: pruned[0] + w - now
      };
    }

    pruned.push(now);
    hits.set(k, pruned);

    return {
      ok: true,
      retryAfterMs: 0
    };
  }

  return { check };
}