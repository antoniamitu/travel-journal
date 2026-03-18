// backend/src/routes/ai.routes.js
import { Router } from "express";
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireJsonBody } from "../utils/requireJsonBody.js";
import { HttpError } from "../utils/httpError.js";
import {
  createSlidingWindowRateLimiter,
  setRetryAfterHeader
} from "../utils/slidingWindowRateLimiter.js";
import { learnMore } from "../controllers/ai.controller.js";

const router = Router();

const userLimiter = createSlidingWindowRateLimiter(ENV.AI_LEARN_MORE_WINDOW_MS);
const globalLimiter = createSlidingWindowRateLimiter(ENV.AI_LEARN_MORE_WINDOW_MS);

function rejectRateLimit(res, next, retryAfterMs, message) {
  setRetryAfterHeader(res, retryAfterMs);
  return next(new HttpError(429, message));
}

function aiLearnMoreLimiter(req, res, next) {
  const userKey = `user:${req.userId}`;
  const globalKey = "global:ai:learn-more";

  // Simpler than preview/commit and safer than consuming shared global capacity first.
  const userLimit = userLimiter.check(userKey, ENV.AI_LEARN_MORE_MAX_PER_WINDOW);
  if (!userLimit.ok) {
    return rejectRateLimit(
      res,
      next,
      userLimit.retryAfterMs,
      "Too many AI requests. Please try again in a moment."
    );
  }

  const globalLimit = globalLimiter.check(globalKey, ENV.AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW);
  if (!globalLimit.ok) {
    return rejectRateLimit(
      res,
      next,
      globalLimit.retryAfterMs,
      "AI service is busy right now. Please try again in a moment."
    );
  }

  return next();
}

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "ai" });
  })
);

router.post(
  "/learn-more",
  requireAuth,
  requireJsonBody,
  aiLearnMoreLimiter,
  asyncHandler(learnMore)
);

export default router;