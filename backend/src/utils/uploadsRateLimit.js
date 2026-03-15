// backend/src/utils/uploadsRateLimit.js
import { createSlidingWindowRateLimiter } from "./slidingWindowRateLimiter.js";

const WINDOW_MS = 60_000;

const LIMITS = {
  sign: 30,
  cleanup: 10
};

/**
 * NOTE:
 * Works for one Node instance (e.g., Render free tier single instance).
 * If you scale horizontally or restart the process, counters reset/split.
 * For multi-instance correctness, move this to Redis or DB-based limiting.
 */
const limiter = createSlidingWindowRateLimiter(WINDOW_MS);

export function checkUploadsLimit(action, userId, ip) {
  const max = LIMITS[action] ?? 10;

  const key =
    Number.isInteger(userId) && userId > 0
      ? `user:${userId}:${action}`
      : `ip:${ip || "unknown"}:${action}`;

  return limiter.check(key, max);
}