// backend/src/controllers/posts.controller.js
import { Prisma } from "@prisma/client";
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
import {
  verifyPhotoLocationForPost,
  toPhotoVerificationPersistenceFields
} from "../services/photoLocationVerification.service.js";
import { mapMapFeedRowToApi, mapPostToApi } from "../mappers/post.mapper.js";
import {
  classifyPlaceCategory,
  isValidPlaceCategory,
  PLACE_CATEGORY_VALUES,
  shouldEnrichPlaceCategory
} from "../utils/classifyPlaceCategory.js";
import { mapNominatimSearchResults } from "../utils/mapNominatim.js";
import { searchPlaceForEnrichment } from "../services/nominatim.service.js";
import { canEnqueue, nominatimQueue } from "../services/nominatimQueue.js";
import analyzeSentiment from "../utils/analyzeSentiment.js";
import { SENTIMENT_VALUES } from "../constants/sentiment.js";

const fixNegZero = (n) => (Object.is(n, -0) ? 0 : n);

const POST_API_SELECT = {
  id: true,
  user_id: true,
  user: {
    select: {
      username: true
    }
  },
  title: true,
  content: true,
  latitude: true,
  longitude: true,
  location_name: true,
  city: true,
  country: true,
  place_category: true,
  osm_class: true,
  osm_subtype: true,
  address_type: true,
  sentiment: true,
  sentiment_score: true,
  privacy: true,
  photo_verification_status: true,
  photo_verification_checked_at: true,
  photo_verification_confidence: true,
  photo_verification_distance_meters: true,
  photo_verification_detected_name: true,
  photo_verification_reasons: true,
  photo_verification_provider: true,
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
  latitude: true,
  longitude: true,
  location_name: true,
  city: true,
  country: true,
  place_category: true,
  osm_class: true,
  osm_subtype: true,
  address_type: true,
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

const DEFAULT_FEED_PAGE = 1;
const DEFAULT_FEED_LIMIT = 12;
const MAX_FEED_LIMIT = 24;
const MAX_FEED_QUERY_LENGTH = 120;
const DEFAULT_SUGGEST_LIMIT = 5;
const MAX_SUGGEST_LIMIT = 10;
const ALLOWED_FEED_SENTIMENTS = new Set(SENTIMENT_VALUES);
const ALLOWED_FEED_CATEGORIES = new Set(PLACE_CATEGORY_VALUES);
const DEFAULT_PLACE_CATEGORY = "other";
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_RE = /[^a-z0-9]+/g;

const FEED_POSTS_SELECT_SQL = Prisma.sql`
  SELECT
    p.id,
    p.user_id,
    u.username,
    p.title,
    CASE
      WHEN char_length(p.content) > 220 THEN left(p.content, 220) || '...'
      ELSE p.content
    END AS content_preview,
    p.location_name,
    p.city,
    p.country,
    p.place_category,
    p.latitude,
    p.longitude,
    p.sentiment,
    p.sentiment_score,
    p.privacy,
    p.created_at,
    COALESCE(img_count.image_count, 0) AS image_count,
    img_first.preview_image,
    COALESCE(img_strip.preview_images, '[]'::json) AS preview_images
  FROM posts p
  INNER JOIN users u
    ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS image_count
    FROM post_images pi
    WHERE pi.post_id = p.id
  ) img_count ON TRUE
  LEFT JOIN LATERAL (
    SELECT pi.secure_url AS preview_image
    FROM post_images pi
    WHERE pi.post_id = p.id
    ORDER BY pi.display_order ASC, pi.id ASC
    LIMIT 1
  ) img_first ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(preview.secure_url ORDER BY preview.display_order ASC, preview.id ASC) AS preview_images
    FROM (
      SELECT pi.id, pi.secure_url, pi.display_order
      FROM post_images pi
      WHERE pi.post_id = p.id
      ORDER BY pi.display_order ASC, pi.id ASC
      LIMIT 3
    ) preview
  ) img_strip ON TRUE
`;

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

  if (err?.code === "P2002" && getP2002Target(err).includes("public_id")) {
    return false;
  }

  return true;
}

function normalizePreviewImages(value) {
  const sanitize = (items) =>
    items.filter((item) => typeof item === "string" && item.trim() !== "");

  if (Array.isArray(value)) {
    return sanitize(value);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? sanitize(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapFeedRowToApi(row, viewerUserId) {
  const base = mapMapFeedRowToApi(row);
  const isOwner = row.user_id === viewerUserId;

  return {
    ...base,
    city: row.city || null,
    country: row.country || null,
    previewImages: normalizePreviewImages(row.preview_images),
    isOwner,
    canEdit: isOwner,
    canDelete: isOwner
  };
}

function normalizeLooseSearchKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RE, "");
}

function buildSuggestionLabel(kind, rawLabel, city, country) {
  const baseLabel = String(rawLabel || "").trim();
  if (!baseLabel) return "";

  if (kind === "city") {
    return country ? `${baseLabel}, ${country}` : baseLabel;
  }

  if (kind !== "place") {
    return baseLabel;
  }

  const baseKey = normalizeLooseSearchKey(baseLabel);
  const extras = [];

  if (city) {
    const cityKey = normalizeLooseSearchKey(city);
    if (cityKey && !baseKey.includes(cityKey)) {
      extras.push(city);
    }
  }

  if (country) {
    const countryKey = normalizeLooseSearchKey(country);
    if (countryKey && !baseKey.includes(countryKey)) {
      extras.push(country);
    }
  }

  if (extras.length === 0) {
    return baseLabel;
  }

  return `${baseLabel}, ${extras.join(", ")}`;
}

function parseFeedListQuery(query) {
  const errors = {};
  let page = DEFAULT_FEED_PAGE;
  let limit = DEFAULT_FEED_LIMIT;
  let q;
  let qSearchKey;
  let sentiment;
  let category;

  if (query?.page != null && String(query.page).trim() !== "") {
    const rawPage = String(query.page).trim();

    if (!/^[1-9]\d*$/.test(rawPage)) {
      errors.page = "page must be a positive integer";
    } else {
      const parsedPage = Number(rawPage);

      if (!Number.isSafeInteger(parsedPage)) {
        errors.page = "page is too large";
      } else {
        page = parsedPage;
      }
    }
  }

  if (query?.limit != null && String(query.limit).trim() !== "") {
    const rawLimit = String(query.limit).trim();

    if (!/^[1-9]\d*$/.test(rawLimit)) {
      errors.limit = "limit must be a positive integer";
    } else {
      const parsedLimit = Number(rawLimit);

      if (!Number.isSafeInteger(parsedLimit)) {
        errors.limit = "limit is too large";
      } else if (parsedLimit > MAX_FEED_LIMIT) {
        errors.limit = `limit must be between 1 and ${MAX_FEED_LIMIT}`;
      } else {
        limit = parsedLimit;
      }
    }
  }

  if (query?.q != null) {
    const rawQ = String(query.q).trim();

    if (rawQ.length > MAX_FEED_QUERY_LENGTH) {
      errors.q = `q must be at most ${MAX_FEED_QUERY_LENGTH} characters`;
    } else if (rawQ !== "") {
      q = rawQ;
      qSearchKey = normalizeLooseSearchKey(rawQ);

      if (!qSearchKey) {
        q = undefined;
        qSearchKey = undefined;
      }
    }
  }

  if (query?.sentiment != null && String(query.sentiment).trim() !== "") {
    const rawSentiment = String(query.sentiment).trim().toLowerCase();

    if (!ALLOWED_FEED_SENTIMENTS.has(rawSentiment)) {
      errors.sentiment = "sentiment must be one of: positive, neutral, negative";
    } else {
      sentiment = rawSentiment;
    }
  }

  if (query?.category != null && String(query.category).trim() !== "") {
    const rawCategory = String(query.category).trim().toLowerCase();

    if (!ALLOWED_FEED_CATEGORIES.has(rawCategory)) {
      errors.category = `category must be one of: ${PLACE_CATEGORY_VALUES.join(", ")}`;
    } else {
      category = rawCategory;
    }
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    errors.page = "page is too large";
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, "Validation failed", errors);
  }

  return { page, limit, offset, q, qSearchKey, sentiment, category };
}

function parseLocationSuggestQuery(query) {
  const errors = {};
  let q = "";
  let qSearchKey = "";
  let limit = DEFAULT_SUGGEST_LIMIT;

  if (query?.q != null) {
    q = String(query.q).trim();
  }

  if (q.length > MAX_FEED_QUERY_LENGTH) {
    errors.q = `q must be at most ${MAX_FEED_QUERY_LENGTH} characters`;
  }

  if (query?.limit != null && String(query.limit).trim() !== "") {
    const rawLimit = String(query.limit).trim();

    if (!/^[1-9]\d*$/.test(rawLimit)) {
      errors.limit = "limit must be a positive integer";
    } else {
      const parsedLimit = Number(rawLimit);

      if (!Number.isSafeInteger(parsedLimit)) {
        errors.limit = "limit is too large";
      } else if (parsedLimit > MAX_SUGGEST_LIMIT) {
        errors.limit = `limit must be between 1 and ${MAX_SUGGEST_LIMIT}`;
      } else {
        limit = parsedLimit;
      }
    }
  }

  qSearchKey = normalizeLooseSearchKey(q);

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, "Validation failed", errors);
  }

  return { q, qSearchKey, limit };
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function getReusableStoredPlaceCategory(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!isValidPlaceCategory(normalized) || normalized === DEFAULT_PLACE_CATEGORY) {
    return null;
  }

  return normalized;
}

function isSameLocationCore(existingPost, incomingLocation) {
  return (
    fixNegZero(existingPost.latitude) === fixNegZero(incomingLocation.latitude) &&
    fixNegZero(existingPost.longitude) === fixNegZero(incomingLocation.longitude) &&
    normalizeOptionalText(existingPost.location_name) ===
      normalizeOptionalText(incomingLocation.locationName) &&
    normalizeOptionalText(existingPost.city) === normalizeOptionalText(incomingLocation.city) &&
    normalizeOptionalText(existingPost.country) ===
      normalizeOptionalText(incomingLocation.country)
  );
}

function getStoredLocationMetadataFallback(existingPost, sameLocation) {
  if (!existingPost || !sameLocation) {
    return {
      osmClass: null,
      osmSubtype: null,
      addressType: null
    };
  }

  return {
    osmClass: normalizeOptionalText(existingPost.osm_class),
    osmSubtype: normalizeOptionalText(existingPost.osm_subtype),
    addressType: normalizeOptionalText(existingPost.address_type)
  };
}

function buildLocationClassificationInput(incomingLocation, existingPost = null, sameLocation = null) {
  const resolvedSameLocation =
    typeof sameLocation === "boolean"
      ? sameLocation
      : existingPost
        ? isSameLocationCore(existingPost, incomingLocation)
        : false;

  const storedFallback = getStoredLocationMetadataFallback(existingPost, resolvedSameLocation);

  return {
    locationName: incomingLocation.locationName,
    city: incomingLocation.city ?? null,
    country: incomingLocation.country ?? null,
    displayName: incomingLocation.displayName ?? null,
    osmClass: incomingLocation.osmClass ?? storedFallback.osmClass,
    osmSubtype: incomingLocation.osmSubtype ?? storedFallback.osmSubtype,
    addressType: incomingLocation.addressType ?? storedFallback.addressType
  };
}

function buildPhotoVerificationLocationInput(
  incomingLocation,
  existingPost = null,
  sameLocation = null
) {
  const resolvedSameLocation =
    typeof sameLocation === "boolean"
      ? sameLocation
      : existingPost
        ? isSameLocationCore(existingPost, incomingLocation)
        : false;

  const storedFallback = getStoredLocationMetadataFallback(existingPost, resolvedSameLocation);

  return {
    latitude: incomingLocation.latitude,
    longitude: incomingLocation.longitude,
    locationName: incomingLocation.locationName,
    city: incomingLocation.city ?? null,
    country: incomingLocation.country ?? null,
    displayName: incomingLocation.displayName ?? null,
    osmClass: incomingLocation.osmClass ?? storedFallback.osmClass,
    osmSubtype: incomingLocation.osmSubtype ?? storedFallback.osmSubtype,
    addressType: incomingLocation.addressType ?? storedFallback.addressType
  };
}

function buildPhotoVerificationInput(location, images) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    locationName: location.locationName,
    city: location.city,
    country: location.country,
    displayName: location.displayName,
    osmClass: location.osmClass,
    osmSubtype: location.osmSubtype,
    addressType: location.addressType,
    images
  };
}

function sendPhotoLocationMismatch(res, result) {
  return res.status(422).json({
    ok: false,
    code: "PHOTO_LOCATION_MISMATCH",
    message: "The photo seems to correspond to a different location than the one selected.",
    verification: {
      status: "mismatch",
      detectedLandmark: result.detectedName,
      confidence: result.confidence,
      distanceMeters: result.distanceMeters,
      reasons: Array.isArray(result.reasons) ? result.reasons : []
    }
  });
}

async function resolvePlaceClassification(input, { logContext = {} } = {}) {
  const baseInput = {
    locationName: input.locationName,
    city: input.city ?? null,
    country: input.country ?? null,
    displayName: input.displayName ?? null,
    osmClass: input.osmClass ?? null,
    osmSubtype: input.osmSubtype ?? null,
    addressType: input.addressType ?? null
  };

  let placeCategory = classifyPlaceCategory(baseInput);
  let osmClass = baseInput.osmClass;
  let osmSubtype = baseInput.osmSubtype;
  let addressType = baseInput.addressType;

  if (placeCategory === DEFAULT_PLACE_CATEGORY && shouldEnrichPlaceCategory(baseInput)) {
    if (canEnqueue()) {
      try {
        const raw = await nominatimQueue.add(() =>
          searchPlaceForEnrichment(baseInput.locationName, baseInput.city)
        );

        const enriched = mapNominatimSearchResults(raw)[0] || null;

        if (enriched) {
          const enrichedInput = {
            locationName: enriched.locationName || baseInput.locationName,
            city: enriched.city || baseInput.city,
            country: enriched.country || baseInput.country,
            displayName: enriched.displayName || baseInput.displayName,
            osmClass: enriched.osmClass || baseInput.osmClass,
            osmSubtype: enriched.osmSubtype || baseInput.osmSubtype,
            addressType: enriched.addressType || baseInput.addressType
          };

          const enrichedCategory = classifyPlaceCategory(enrichedInput);

          // Keep improved internal OSM metadata even if the final category still remains "other".
          // These fields are useful later for debugging, reclasificare and potential backfill.
          osmClass = normalizeOptionalText(enrichedInput.osmClass);
          osmSubtype = normalizeOptionalText(enrichedInput.osmSubtype);
          addressType = normalizeOptionalText(enrichedInput.addressType);

          if (enrichedCategory !== DEFAULT_PLACE_CATEGORY) {
            placeCategory = enrichedCategory;
          }
        }
      } catch (err) {
        console.warn("Place-category enrichment failed; continuing with base classification", {
          ...logContext,
          locationName: baseInput.locationName,
          city: baseInput.city,
          error: err?.message || String(err)
        });
      }
    } else {
      console.warn("Skipped place-category enrichment because Nominatim queue is busy", {
        ...logContext,
        locationName: baseInput.locationName,
        city: baseInput.city
      });
    }
  }

  if (!isValidPlaceCategory(placeCategory)) {
    placeCategory = DEFAULT_PLACE_CATEGORY;
  }

  return {
    placeCategory,
    osmClass: normalizeOptionalText(osmClass),
    osmSubtype: normalizeOptionalText(osmSubtype),
    addressType: normalizeOptionalText(addressType)
  };
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
    console.warn(
      "Skipped unattached upload cleanup because DB attachment state could not be verified",
      {
        ...context,
        userId,
        publicIds: ids,
        error: err?.message || String(err)
      }
    );
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

  const incomingLocation = {
    latitude,
    longitude,
    locationName: parsed.data.locationName,
    city: parsed.data.city,
    country: parsed.data.country,
    displayName: parsed.data.displayName,
    osmClass: parsed.data.osmClass,
    osmSubtype: parsed.data.osmSubtype,
    addressType: parsed.data.addressType
  };

  const verificationLocation = buildPhotoVerificationLocationInput(incomingLocation);

  const photoVerification = await verifyPhotoLocationForPost(
    buildPhotoVerificationInput(verificationLocation, images),
    {
      logContext: {
        operation: "create",
        userId
      }
    }
  );

  // Intentionally do NOT cleanup draft uploads on photo-location mismatch here.
  // The user may want to correct the selected location and retry with the same
  // already-uploaded images. Draft/orphan cleanup is handled elsewhere.
  if (photoVerification.status === "mismatch") {
    return sendPhotoLocationMismatch(res, photoVerification);
  }

  const classification = await resolvePlaceClassification(
    buildLocationClassificationInput(incomingLocation),
    {
      logContext: {
        operation: "create",
        userId
      }
    }
  );

  const sentimentAnalysis = analyzeSentiment({
    title: parsed.data.title,
    content: parsed.data.content
  });

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
        place_category: classification.placeCategory,
        osm_class: classification.osmClass,
        osm_subtype: classification.osmSubtype,
        address_type: classification.addressType,
        sentiment: sentimentAnalysis.label,
        sentiment_score: sentimentAnalysis.score,
        privacy: parsed.data.privacy,
        ...toPhotoVerificationPersistenceFields(photoVerification),
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

// Step 4.x — GET /api/posts
export async function listFeed(req, res) {
  const prisma = getPrisma();
  const userId = req.userId;
  const { page, limit, offset, qSearchKey, sentiment, category } = parseFeedListQuery(req.query);

  const searchSql = qSearchKey
    ? Prisma.sql`
        AND (
          regexp_replace(unaccent(lower(COALESCE(p.location_name, ''))), '[^a-z0-9]+', '', 'g') LIKE ${`%${qSearchKey}%`}
          OR regexp_replace(unaccent(lower(COALESCE(p.city, ''))), '[^a-z0-9]+', '', 'g') LIKE ${`%${qSearchKey}%`}
          OR regexp_replace(unaccent(lower(COALESCE(p.country, ''))), '[^a-z0-9]+', '', 'g') LIKE ${`%${qSearchKey}%`}
          OR regexp_replace(
            unaccent(
              lower(
                concat_ws(' ', COALESCE(p.location_name, ''), COALESCE(p.city, ''), COALESCE(p.country, ''))
              )
            ),
            '[^a-z0-9]+',
            '',
            'g'
          ) LIKE ${`%${qSearchKey}%`}
        )
      `
    : Prisma.empty;

  const sentimentSql = sentiment ? Prisma.sql` AND p.sentiment = ${sentiment}` : Prisma.empty;
  const categorySql = category ? Prisma.sql` AND p.place_category = ${category}` : Prisma.empty;

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      ${FEED_POSTS_SELECT_SQL}
      WHERE
        p.privacy = 'public'
        AND p.user_id <> ${userId}
        ${sentimentSql}
        ${categorySql}
        ${searchSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `
  );

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const posts = visibleRows.map((row) => mapFeedRowToApi(row, userId));

  return res.status(200).json({
    ok: true,
    posts,
    pagination: {
      page,
      limit,
      hasMore,
      nextPage: hasMore ? page + 1 : null
    }
  });
}

// Step 5.3 — GET /api/posts/locations/suggest
export async function suggestLocations(req, res) {
  const prisma = getPrisma();
  const userId = req.userId;
  const { qSearchKey, limit } = parseLocationSuggestQuery(req.query);

  if (!qSearchKey || qSearchKey.length < 3) {
    return res.status(200).json({
      ok: true,
      suggestions: []
    });
  }

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      WITH candidates AS (
        SELECT
          'place'::text AS kind,
          p.location_name AS label,
          p.location_name AS query_value,
          p.city,
          p.country,
          MIN(p.created_at) AS first_seen_at
        FROM posts p
        WHERE
          p.privacy = 'public'
          AND p.user_id <> ${userId}
          AND p.location_name IS NOT NULL
          AND btrim(p.location_name) <> ''
        GROUP BY p.location_name, p.city, p.country

        UNION ALL

        SELECT
          'city'::text AS kind,
          p.city AS label,
          p.city AS query_value,
          p.city,
          p.country,
          MIN(p.created_at) AS first_seen_at
        FROM posts p
        WHERE
          p.privacy = 'public'
          AND p.user_id <> ${userId}
          AND p.city IS NOT NULL
          AND btrim(p.city) <> ''
        GROUP BY p.city, p.country

        UNION ALL

        SELECT
          'country'::text AS kind,
          p.country AS label,
          p.country AS query_value,
          NULL::text AS city,
          p.country,
          MIN(p.created_at) AS first_seen_at
        FROM posts p
        WHERE
          p.privacy = 'public'
          AND p.user_id <> ${userId}
          AND p.country IS NOT NULL
          AND btrim(p.country) <> ''
        GROUP BY p.country
      )
      SELECT
        kind,
        label,
        query_value,
        city,
        country,
        first_seen_at
      FROM candidates
      WHERE regexp_replace(unaccent(lower(COALESCE(query_value, ''))), '[^a-z0-9]+', '', 'g') LIKE ${`${qSearchKey}%`}
      ORDER BY
        CASE kind
          WHEN 'place' THEN 0
          WHEN 'city' THEN 1
          ELSE 2
        END ASC,
        char_length(label) ASC,
        label ASC,
        first_seen_at DESC
      LIMIT ${limit * 3}
    `
  );

  const suggestions = [];
  const seen = new Set();

  for (const row of rows) {
    const kind = String(row.kind || "");
    const rawLabel = String(row.label || "").trim();
    const rawQueryValue = String(row.query_value || "").trim();
    const city = typeof row.city === "string" && row.city.trim() ? row.city.trim() : null;
    const country =
      typeof row.country === "string" && row.country.trim() ? row.country.trim() : null;

    if (!rawLabel || !rawQueryValue) continue;

    const label = buildSuggestionLabel(kind, rawLabel, city, country);

    if (!label) continue;

    const dedupeKey = [
      kind,
      normalizeLooseSearchKey(rawLabel),
      normalizeLooseSearchKey(rawQueryValue),
      normalizeLooseSearchKey(city || ""),
      normalizeLooseSearchKey(country || "")
    ].join("::");
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    suggestions.push({
      kind,
      label,
      queryValue: rawQueryValue,
      city,
      country
    });

    if (suggestions.length >= limit) {
      break;
    }
  }

  return res.status(200).json({
    ok: true,
    suggestions
  });
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

  const incomingLocation = {
    latitude,
    longitude,
    locationName: bodyParsed.data.locationName,
    city: bodyParsed.data.city,
    country: bodyParsed.data.country,
    displayName: bodyParsed.data.displayName,
    osmClass: bodyParsed.data.osmClass,
    osmSubtype: bodyParsed.data.osmSubtype,
    addressType: bodyParsed.data.addressType
  };

  const sameLocation = isSameLocationCore(existingPost, incomingLocation);

  const verificationLocation = buildPhotoVerificationLocationInput(
    incomingLocation,
    existingPost,
    sameLocation
  );

  const photoVerification = await verifyPhotoLocationForPost(
    buildPhotoVerificationInput(verificationLocation, images),
    {
      logContext: {
        operation: "update",
        userId,
        postId
      }
    }
  );

  // Intentionally do NOT cleanup draft uploads on photo-location mismatch here.
  // The user may want to correct the selected location and retry with the same
  // already-uploaded images. Draft/orphan cleanup is handled elsewhere.
  if (photoVerification.status === "mismatch") {
    return sendPhotoLocationMismatch(res, photoVerification);
  }

  const reusableStoredPlaceCategory = sameLocation
    ? getReusableStoredPlaceCategory(existingPost.place_category)
    : null;

  let classification;
  if (reusableStoredPlaceCategory) {
    // If the physical location did not change and DB already holds a strong stored category,
    // reuse it together with the stored OSM metadata.
    // We intentionally DO NOT reuse "other" here, so legacy/incomplete posts can be reclassified
    // when a later update sends richer OSM signals for the same location.
    classification = {
      placeCategory: reusableStoredPlaceCategory,
      osmClass: normalizeOptionalText(existingPost.osm_class),
      osmSubtype: normalizeOptionalText(existingPost.osm_subtype),
      addressType: normalizeOptionalText(existingPost.address_type)
    };
  } else {
    classification = await resolvePlaceClassification(
      buildLocationClassificationInput(incomingLocation, existingPost, sameLocation),
      {
        logContext: {
          operation: "update",
          userId,
          postId
        }
      }
    );
  }

  const sentimentAnalysis = analyzeSentiment({
    title: bodyParsed.data.title,
    content: bodyParsed.data.content
  });

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
          place_category: classification.placeCategory,
          osm_class: classification.osmClass,
          osm_subtype: classification.osmSubtype,
          address_type: classification.addressType,
          sentiment: sentimentAnalysis.label,
          sentiment_score: sentimentAnalysis.score,
          privacy: bodyParsed.data.privacy,
          ...toPhotoVerificationPersistenceFields(photoVerification)
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