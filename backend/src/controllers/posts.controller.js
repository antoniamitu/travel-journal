// backend/src/controllers/posts.controller.js
import { getPrisma } from "../config/prisma.js";
import { ENV } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import {
  createPostSchema,
  postIdParamsSchema,
  updatePostSchema
} from "../validators/post.validator.js";
import { cleanupUploads, getUploadFolderForUser } from "../services/cloudinary.service.js";
import { mapPostToApi } from "../mappers/post.mapper.js";

const fixNegZero = (n) => (Object.is(n, -0) ? 0 : n);

const POST_API_SELECT = {
  id: true,
  user_id: true,
  title: true,
  content: true,
  latitude: true,
  longitude: true,
  location_name: true,
  city: true,
  country: true,
  sentiment: true,
  privacy: true,
  created_at: true,
  updated_at: true,
  images: {
    orderBy: { display_order: "asc" },
    select: {
      id: true,
      secure_url: true,
      public_id: true,
      display_order: true,
      created_at: true
    }
  }
};

const POST_OWNERSHIP_SELECT = {
  id: true,
  user_id: true,
  images: {
    orderBy: { display_order: "asc" },
    select: {
      id: true,
      secure_url: true,
      public_id: true,
      display_order: true,
      created_at: true
    }
  }
};

function parseUrlSafe(u) {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function isCloudinarySecureUrlForThisCloud(secureUrl) {
  const url = parseUrlSafe(secureUrl);
  if (!url) return false;

  if (url.protocol !== "https:") return false;
  if (url.hostname !== "res.cloudinary.com") return false;

  return url.pathname.startsWith(`/${ENV.CLOUDINARY_CLOUD_NAME}/image/upload/`);
}

/**
 * Ensures the URL path contains "/<publicId>" as the asset identifier.
 * Works with transformed URLs and various file extensions, including HEIC/HEIF.
 */
function urlPathContainsPublicId(secureUrl, publicId) {
  const url = parseUrlSafe(secureUrl);
  if (!url) return false;

  const marker = `/${publicId}`;
  const idx = url.pathname.lastIndexOf(marker);
  if (idx < 0) return false;

  const after = url.pathname.slice(idx + marker.length);
  return after === "" || after.startsWith(".") || after.startsWith("/");
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }

  return out;
}

function getP2002Target(err) {
  const target = err?.meta?.target;
  return Array.isArray(target) ? target.join(",") : String(target || "");
}

function shouldAttemptUnattachedCleanup(err, candidatePublicIds) {
  if (!Array.isArray(candidatePublicIds) || candidatePublicIds.length === 0) {
    return false;
  }

  // Known case: these publicIds already belong to another saved post.
  // Querying DB again just to rediscover that fact is wasted work.
  if (err?.code === "P2002" && getP2002Target(err).includes("public_id")) {
    return false;
  }

  // For unknown DB failures, timeouts, partial transaction failures, etc.
  // the cleanup safety net is still worth attempting.
  return true;
}

async function validateIncomingImagesForUser(userId, images) {
  const folderPrefix = getUploadFolderForUser(userId) + "/";

  for (const img of images) {
    if (!img.publicId.startsWith(folderPrefix)) {
      throw new HttpError(400, "Validation failed", {
        images: `All image publicIds must start with "${folderPrefix}"`
      });
    }

    if (!isCloudinarySecureUrlForThisCloud(img.secureUrl)) {
      throw new HttpError(400, "Validation failed", {
        images: "All secureUrl values must be Cloudinary https URLs for this account"
      });
    }

    if (!urlPathContainsPublicId(img.secureUrl, img.publicId)) {
      throw new HttpError(400, "Validation failed", {
        images: "secureUrl does not match publicId"
      });
    }
  }
}

/**
 * Best effort cleanup for uploads that were sent by the client but failed to
 * become attached to a post in the database.
 *
 * Safety rule:
 * we FIRST re-check DB attachment state and clean up ONLY publicIds that are not
 * attached anywhere. If DB attachment state cannot be verified, we skip cleanup
 * rather than risk deleting a real image that is already referenced by a post.
 */
async function cleanupUnattachedUploads(prisma, userId, publicIds, context) {
  const ids = uniqueStrings(publicIds);
  if (ids.length === 0) return;

  let attachedRows;
  try {
    attachedRows = await prisma.postImage.findMany({
      where: {
        public_id: {
          in: ids
        }
      },
      select: {
        public_id: true
      }
    });
  } catch (err) {
    console.warn("Skipped unattached upload cleanup because DB attachment state could not be verified", {
      ...context,
      userId,
      publicIds: ids,
      error: err?.message || String(err)
    });
    return;
  }

  const attachedSet = new Set(attachedRows.map((row) => row.public_id));
  const cleanupIds = ids.filter((id) => !attachedSet.has(id));

  if (cleanupIds.length === 0) {
    return;
  }

  try {
    const result = await cleanupUploads(userId, cleanupIds);

    if (result.failed.length > 0) {
      console.warn("Unattached upload cleanup had partial failures", {
        ...context,
        userId,
        failedCount: result.failed.length,
        failedPublicIds: result.failed
      });
    }
  } catch (err) {
    console.error("Unattached upload cleanup crashed", {
      ...context,
      userId,
      publicIds: cleanupIds,
      error: err?.message || String(err)
    });
  }
}

async function cleanupRemovedImagesAfterUpdate(userId, publicIds, context) {
  const ids = uniqueStrings(publicIds);
  if (ids.length === 0) return;

  try {
    const result = await cleanupUploads(userId, ids, { invalidate: true });

    if (result.failed.length > 0) {
      console.warn("Post update removed-image cleanup had partial failures", {
        ...context,
        userId,
        failedCount: result.failed.length,
        failedPublicIds: result.failed
      });
    }
  } catch (err) {
    console.error("Post update removed-image cleanup crashed", {
      ...context,
      userId,
      publicIds: ids,
      error: err?.message || String(err)
    });
  }
}

export async function create(req, res) {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const userId = req.userId;
  const prisma = getPrisma();

  const latitude = fixNegZero(parsed.data.latitude);
  const longitude = fixNegZero(parsed.data.longitude);
  const images = parsed.data.images;
  const imagePublicIds = images.map((img) => img.publicId);

  await validateIncomingImagesForUser(userId, images);

  try {
    const created = await prisma.post.create({
      data: {
        user_id: userId,
        title: parsed.data.title,
        content: parsed.data.content,
        latitude,
        longitude,
        location_name: parsed.data.locationName,
        city: parsed.data.city,
        country: parsed.data.country,
        sentiment: parsed.data.sentiment,
        privacy: parsed.data.privacy,
        ...(images.length > 0
          ? {
              images: {
                create: images.map((img, idx) => ({
                  secure_url: img.secureUrl,
                  public_id: img.publicId,
                  display_order: idx
                }))
              }
            }
          : {})
      },
      select: POST_API_SELECT
    });

    return res.status(201).json({ ok: true, post: mapPostToApi(created, userId) });
  } catch (err) {
    if (shouldAttemptUnattachedCleanup(err, imagePublicIds)) {
      await cleanupUnattachedUploads(prisma, userId, imagePublicIds, {
        operation: "create"
      });
    }

    if (err?.code === "P2002") {
      const target = getP2002Target(err);

      if (target.includes("public_id")) {
        throw new HttpError(409, "One or more images are already attached to another post.");
      }

      throw new HttpError(409, "Conflict");
    }

    throw err;
  }
}

// Step 2.2 — GET /api/posts/:id
export async function getById(req, res) {
  const parsed = postIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const prisma = getPrisma();
  const userId = req.userId;
  const postId = parsed.data.id;

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      OR: [{ user_id: userId }, { privacy: { equals: "public", mode: "insensitive" } }]
    },
    select: POST_API_SELECT
  });

  if (!post) {
    throw new HttpError(404, "Not found");
  }

  return res.status(200).json({ ok: true, post: mapPostToApi(post, userId) });
}

// Step 2.4 — PUT /api/posts/:id
export async function update(req, res) {
  const paramsParsed = postIdParamsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(paramsParsed.error));
  }

  const bodyParsed = updatePostSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(bodyParsed.error));
  }

  const prisma = getPrisma();
  const userId = req.userId;
  const postId = paramsParsed.data.id;

  const latitude = fixNegZero(bodyParsed.data.latitude);
  const longitude = fixNegZero(bodyParsed.data.longitude);
  const images = bodyParsed.data.images;

  await validateIncomingImagesForUser(userId, images);

  // No-leak consistency:
  // only search among posts owned by the current user.
  const existingPost = await prisma.post.findFirst({
    where: {
      id: postId,
      user_id: userId
    },
    select: POST_OWNERSHIP_SELECT
  });

  if (!existingPost) {
    throw new HttpError(404, "Not found");
  }

  const existingByPublicId = new Map(existingPost.images.map((img) => [img.public_id, img]));
  const incomingSet = new Set(images.map((img) => img.publicId));

  const removedPublicIds = existingPost.images
    .filter((img) => !incomingSet.has(img.public_id))
    .map((img) => img.public_id);

  const newImages = images.filter((img) => !existingByPublicId.has(img.publicId));
  const newImagePublicIds = newImages.map((img) => img.publicId);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: postId },
        data: {
          title: bodyParsed.data.title,
          content: bodyParsed.data.content,
          latitude,
          longitude,
          location_name: bodyParsed.data.locationName,
          city: bodyParsed.data.city,
          country: bodyParsed.data.country,
          sentiment: bodyParsed.data.sentiment,
          privacy: bodyParsed.data.privacy
        }
      });

      if (removedPublicIds.length > 0) {
        await tx.postImage.deleteMany({
          where: {
            post_id: postId,
            public_id: {
              in: removedPublicIds
            }
          }
        });
      }

      for (let idx = 0; idx < images.length; idx += 1) {
        const img = images[idx];
        const existing = existingByPublicId.get(img.publicId);

        if (existing) {
          await tx.postImage.update({
            where: { id: existing.id },
            data: {
              display_order: idx
            }
          });
        } else {
          await tx.postImage.create({
            data: {
              post_id: postId,
              secure_url: img.secureUrl,
              public_id: img.publicId,
              display_order: idx
            }
          });
        }
      }

      const fresh = await tx.post.findUnique({
        where: { id: postId },
        select: POST_API_SELECT
      });

      if (!fresh) {
        throw new Error("Updated post could not be reloaded");
      }

      return fresh;
    });

    await cleanupRemovedImagesAfterUpdate(userId, removedPublicIds, {
      operation: "update",
      postId
    });

    return res.status(200).json({
      ok: true,
      post: mapPostToApi(updated, userId)
    });
  } catch (err) {
    if (shouldAttemptUnattachedCleanup(err, newImagePublicIds)) {
      await cleanupUnattachedUploads(prisma, userId, newImagePublicIds, {
        operation: "update",
        postId
      });
    }

    if (err?.code === "P2002") {
      const target = getP2002Target(err);

      if (target.includes("public_id")) {
        throw new HttpError(409, "One or more images are already attached to another post.");
      }

      throw new HttpError(409, "Conflict");
    }

    throw err;
  }
}

// Step 2.3 — DELETE /api/posts/:id
export async function remove(req, res) {
  const parsed = postIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const prisma = getPrisma();
  const userId = req.userId;
  const postId = parsed.data.id;

  // No-leak rule:
  // only search among posts owned by the current user.
  // public non-owner and private non-owner both become 404.
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      user_id: userId
    },
    select: {
      id: true,
      images: {
        orderBy: { display_order: "asc" },
        select: {
          public_id: true
        }
      }
    }
  });

  if (!post) {
    throw new HttpError(404, "Not found");
  }

  const publicIds = post.images.map((img) => img.public_id);

  // Source of truth first:
  // delete DB record first so the app never ends up showing a post whose images were already deleted.
  try {
    await prisma.post.delete({
      where: {
        id: postId
      }
    });
  } catch (err) {
    if (err?.code === "P2025") {
      throw new HttpError(404, "Not found");
    }

    throw err;
  }

  // Best-effort external cleanup after DB success.
  // For real post deletion we explicitly invalidate CDN caches too.
  let cleanupResult = {
    deleted: [],
    failed: publicIds.slice()
  };

  if (publicIds.length > 0) {
    try {
      cleanupResult = await cleanupUploads(userId, publicIds, { invalidate: true });
    } catch (err) {
      console.error("Post delete Cloudinary cleanup crashed", {
        postId,
        userId,
        error: err?.message || String(err)
      });
    }
  }

  if (cleanupResult.failed.length > 0) {
    console.warn("Post delete Cloudinary cleanup had partial failures", {
      postId,
      userId,
      failedCount: cleanupResult.failed.length,
      failedPublicIds: cleanupResult.failed
    });
  }

  return res.status(200).json({
    ok: true,
    message: "Post deleted",
    deletedPostId: postId,
    cloudinaryCleanup: {
      deleted: cleanupResult.deleted,
      failed: cleanupResult.failed
    }
  });
}