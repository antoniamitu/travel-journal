// backend/src/controllers/uploads.controller.js
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { uploadsCleanupSchema } from "../validators/uploads.validator.js";
import { buildSignedUploadPayload, cleanupUploads, getUploadFolderForUser } from "../services/cloudinary.service.js";
import { checkUploadsLimit } from "../utils/uploadsRateLimit.js";
import { setRetryAfterHeader } from "../utils/slidingWindowRateLimiter.js";
import { ENV } from "../config/env.js";
import { getPrisma } from "../config/prisma.js";

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

  const prefix = getUploadFolderForUser(userId) + "/";
  const invalid = parsed.data.publicIds.filter((id) => !id.startsWith(prefix));

  if (invalid.length > 0) {
    throw new HttpError(400, "Validation failed", {
      publicIds: `All publicIds must start with "${prefix}"`
    });
  }

  const prisma = getPrisma();

  let attachedRows;
  try {
    attachedRows = await prisma.postImage.findMany({
      where: {
        public_id: {
          in: parsed.data.publicIds
        }
      },
      select: {
        public_id: true
      }
    });
  } catch (err) {
    console.warn("Skipped upload cleanup because DB attachment state could not be verified", {
      userId,
      publicIds: parsed.data.publicIds,
      error: err?.message || String(err)
    });

    throw new HttpError(503, "Upload cleanup temporarily unavailable. Please try again shortly.");
  }

  const attachedSet = new Set(attachedRows.map((row) => row.public_id));
  const skippedAttached = parsed.data.publicIds.filter((id) => attachedSet.has(id));
  const unattachedPublicIds = parsed.data.publicIds.filter((id) => !attachedSet.has(id));

  if (unattachedPublicIds.length === 0) {
    return res.status(200).json({
      ok: true,
      deleted: [],
      failed: [],
      skippedAttached,
      ...devMeta({ expectedPrefix: prefix })
    });
  }

  const result = await cleanupUploads(userId, unattachedPublicIds);

  return res.status(200).json({
    ok: true,
    deleted: result.deleted,
    failed: result.failed,
    skippedAttached,
    ...devMeta({ expectedPrefix: result.expectedPrefix })
  });
}