// backend/src/middleware/postsWriteLimiter.js
import { HttpError } from "../utils/httpError.js";
import {
  createSlidingWindowRateLimiter,
  setRetryAfterHeader
} from "../utils/slidingWindowRateLimiter.js";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20; // create/update/delete posts per minute per user

const limiter = createSlidingWindowRateLimiter(WINDOW_MS);

export function postsWriteLimiter(req, res, next) {
  if (!Number.isInteger(req.userId) || req.userId <= 0) {
    return next(new HttpError(401, "Unauthorized"));
  }

  const limit = limiter.check(`user:${req.userId}`, MAX_PER_WINDOW);

  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    return next(new HttpError(429, "Too many post changes, please slow down"));
  }

  return next();
}