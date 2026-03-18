// backend/src/controllers/uploads.controller.js
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { uploadsCleanupSchema } from "../validators/uploads.validator.js";
import { buildSignedUploadPayload, cleanupUploads, getUploadFolderForUser } from "../services/cloudinary.service.js";
import { checkUploadsLimit } from "../utils/uploadsRateLimit.js";
import { setRetryAfterHeader } from "../utils/slidingWindowRateLimiter.js";
import { ENV } from "../config/env.js";

function devMeta(obj) {
  return ENV.NODE_ENV === "development" ? obj : {};
}

// requireAuth already guarantees req.userId is a positive integer.
// We keep service-level assertUserId as a defensive layer.
export async function sign(req, res) {
  const userId = req.userId;

  const limit = checkUploadsLimit("sign", userId, req.ip);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    throw new HttpError(429, "Too many upload requests, please slow down");
  }

  // signatures should never be cached
  res.set("Cache-Control", "no-store");

  const payload = buildSignedUploadPayload(userId);

  return res.status(200).json({
    ok: true,
    ...payload
  });
}

export async function cleanup(req, res) {
  const userId = req.userId;

  const limit = checkUploadsLimit("cleanup", userId, req.ip);
  if (!limit.ok) {
    setRetryAfterHeader(res, limit.retryAfterMs);
    throw new HttpError(429, "Too many cleanup requests, please slow down");
  }

  res.set("Cache-Control", "no-store");

  const parsed = uploadsCleanupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  // Per-user folder: expectedPrefix is travel-journal/u_<userId>/
  const prefix = getUploadFolderForUser(userId) + "/";
  const invalid = parsed.data.publicIds.filter((id) => !id.startsWith(prefix));
  if (invalid.length > 0) {
    throw new HttpError(400, "Validation failed", {
      publicIds: `All publicIds must start with "${prefix}"`
    });
  }

  // Draft cleanup path keeps CDN invalidation off by default.
  const result = await cleanupUploads(userId, parsed.data.publicIds);

  return res.status(200).json({
    ok: true,
    deleted: result.deleted,
    failed: result.failed,
    ...devMeta({ expectedPrefix: result.expectedPrefix })
  });
}