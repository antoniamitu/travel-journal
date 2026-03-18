// backend/src/middleware/mapReadLimiter.js
import { HttpError } from "../utils/httpError.js";
import {
  createSlidingWindowRateLimiter,
  setRetryAfterHeader
} from "../utils/slidingWindowRateLimiter.js";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120; // 120 map reads / minute / user

const limiter = createSlidingWindowRateLimiter(WINDOW_MS);

export function mapReadLimiter(req, res, next) {
  const key = `user:${req.userId}`;

  const limit = limiter.check(key, MAX_PER_WINDOW);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    return next(new HttpError(429, "Too many map requests, please slow down"));
  }

  return next();
}