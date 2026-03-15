// backend/src/utils/slidingWindowRateLimiter.js

/**
 * Sliding-window in-memory rate limiter (single-process).
 *
 * NOTE:
 * - Works for one Node instance (e.g., Render free tier single instance).
 * - If you scale horizontally or restart the process, counters reset/split.
 * - For multi-instance correctness, move this to Redis or DB-based limiting.
 */
export function createSlidingWindowRateLimiter(windowMs) {
  const w = Number(windowMs);
  if (!Number.isFinite(w) || w <= 0) {
    throw new Error("createSlidingWindowRateLimiter: windowMs must be a positive number");
  }

  // key -> array of timestamps (ms)
  const hits = new Map();

  function pruneOld(timestamps, now) {
    const cutoff = now - w;
    return timestamps.filter((t) => t > cutoff);
  }

  // Garbage collection
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      const pruned = pruneOld(v, now);
      if (pruned.length === 0) hits.delete(k);
      else hits.set(k, pruned);
    }
  }, w).unref();

  /**
   * @param {string} key
   * @param {number} maxPerWindow
   * @returns {{ ok: boolean, retryAfterMs: number }}
   */
  function check(key, maxPerWindow) {
    const now = Date.now();

    const k = typeof key === "string" && key.trim() ? key : "unknown";

    let max = Number(maxPerWindow);
    // Safety fallback (should never happen in normal code paths)
    if (!Number.isFinite(max) || max <= 0) max = 10;

    const prev = hits.get(k) || [];
    const pruned = pruneOld(prev, now);

    if (pruned.length >= max) {
      hits.set(k, pruned);
      return { ok: false, retryAfterMs: pruned[0] + w - now };
    }

    pruned.push(now);
    hits.set(k, pruned);

    return { ok: true, retryAfterMs: 0 };
  }

  return { check };
}