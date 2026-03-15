// backend/src/services/cloudinary.service.js
import { cloudinary } from "../config/cloudinary.js";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

// Allow HEIC/HEIF so iPhone gallery uploads can be attempted.
// Frontend should still validate and show a friendly fallback if the browser/provider cannot handle them well.
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,heic,heif";
const CLEANUP_CONCURRENCY = 3;

// PRD-aligned client-side guidance: 5MB per image.
// Cloudinary itself will only enforce this if you later add an Upload Preset/server-side restriction.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function assertUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, "Unauthorized");
  }
  return userId;
}

// We intentionally isolate uploads per user for safer cleanup and ownership checks.
export function getUploadFolderForUser(userId) {
  const uid = assertUserId(userId);
  return `${ENV.CLOUDINARY_FOLDER}/u_${uid}`;
}

export function buildSignedUploadPayload(userId) {
  const folder = getUploadFolderForUser(userId);
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signed uploads require the client to send EXACTLY the same signed params.
  const paramsToSign = {
    folder,
    timestamp,
    overwrite: "false",
    unique_filename: "true",
    allowed_formats: ALLOWED_FORMATS
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, ENV.CLOUDINARY_API_SECRET);

  return {
    cloudName: ENV.CLOUDINARY_CLOUD_NAME,
    apiKey: ENV.CLOUDINARY_API_KEY,
    uploadUrl: `https://api.cloudinary.com/v1_1/${ENV.CLOUDINARY_CLOUD_NAME}/image/upload`,
    timestamp,
    signature,
    folder,
    resourceType: "image",
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    enforcedParams: {
      overwrite: "false",
      unique_filename: "true",
      allowed_formats: ALLOWED_FORMATS,
      folder
    }
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = idx++;
      if (current >= items.length) break;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function cleanupUploads(userId, publicIds, { invalidate = false } = {}) {
  const folder = getUploadFolderForUser(userId);
  const prefix = folder + "/";
  const shouldInvalidate = invalidate === true;

  // De-dupe while preserving order
  const seen = new Set();
  const ids = [];

  for (const id of publicIds) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const perId = await mapWithConcurrency(ids, CLEANUP_CONCURRENCY, async (publicId) => {
    if (
      typeof publicId !== "string" ||
      !publicId.startsWith(prefix) ||
      publicId.includes("..") ||
      publicId.includes("\\") ||
      publicId.includes("//")
    ) {
      return { publicId, ok: false };
    }

    try {
      const res = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: shouldInvalidate
      });

      // Treat "not found" as successful cleanup for idempotency.
      if (res?.result === "ok" || res?.result === "not found") {
        return { publicId, ok: true };
      }

      return { publicId, ok: false };
    } catch {
      return { publicId, ok: false };
    }
  });

  const deleted = [];
  const failed = [];

  for (const r of perId) {
    if (r?.ok) deleted.push(r.publicId);
    else failed.push(r.publicId);
  }

  return { deleted, failed, expectedPrefix: prefix };
}