// backend/src/utils/requireJsonBody.js
import { HttpError } from "./httpError.js";

/**
 * requireJsonBody (middleware)
 * - Ensures req.body exists and is a plain object (not array)
 * - Throws HttpError(400) -> centralized error handling
 */
export function requireJsonBody(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(400, "Validation failed", { general: "Invalid request body" });
  }
  return next();
}