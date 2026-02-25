// backend/src/middleware/requireAuth.js
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

/**
 * requireAuth
 * - Expects: Authorization: Bearer <token>
 * - Verifies JWT (HS256) using ENV.JWT_SECRET
 * - Attaches:
 *    - req.userId (number)
 *    - req.authSub (string) for debugging/internal use
 *
 * Security:
 * - Always returns generic 401 "Unauthorized" (no leaks).
 */
export function requireAuth(req, res, next) {
  const header = req.headers?.authorization;

  if (!header || typeof header !== "string") {
    return next(new HttpError(401, "Unauthorized"));
  }

  // Strict parse: must be exactly "Bearer <token>"
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return next(new HttpError(401, "Unauthorized"));
  }

  const token = match[1]?.trim();
  if (!token) {
    return next(new HttpError(401, "Unauthorized"));
  }

  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    // Bulletproof: jwt.verify can theoretically return a string payload
    if (!payload || typeof payload !== "object") {
      return next(new HttpError(401, "Unauthorized"));
    }

    // We expect payload.sub to exist (PRD)
    const sub = payload.sub;
    if (typeof sub !== "string" || !sub.trim()) {
      return next(new HttpError(401, "Unauthorized"));
    }

    // Convert to integer user id
    const userId = Number(sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return next(new HttpError(401, "Unauthorized"));
    }

    // Attach to request for downstream handlers
    req.userId = userId;
    req.authSub = sub;

    return next();
  } catch (err) {
    // Includes: TokenExpiredError, JsonWebTokenError, NotBeforeError
    return next(new HttpError(401, "Unauthorized"));
  }
}