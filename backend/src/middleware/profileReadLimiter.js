// backend/src/middleware/profileReadLimiter.js
import { HttpError } from "../utils/httpError.js";
import {
  createSlidingWindowRateLimiter,
  setRetryAfterHeader
} from "../utils/slidingWindowRateLimiter.js";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60; // 60 profile reads / minute / user (hardening)

const limiter = createSlidingWindowRateLimiter(WINDOW_MS);

export function profileReadLimiter(req, res, next) {
  // requireAuth guarantees req.userId is a positive integer
  const key = `user:${req.userId}`;

  const limit = limiter.check(key, MAX_PER_WINDOW);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    return next(new HttpError(429, "Too many requests, please slow down"));
  }

  return next();
}