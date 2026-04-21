// backend/src/mappers/post.mapper.js
const PLACE_CATEGORY_VALUES = new Set([
  "historical",
  "religious",
  "nature",
  "entertainment",
  "food_drink",
  "shopping",
  "urban_landmark",
  "other"
]);

const PHOTO_VERIFICATION_STATUS_VALUES = new Set(["match", "uncertain", "mismatch"]);

function normalizePlaceCategory(value) {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.trim().toLowerCase();
  return PLACE_CATEGORY_VALUES.has(normalized) ? normalized : "other";
}

function normalizePhotoVerificationStatus(value) {
  if (value == null || typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PHOTO_VERIFICATION_STATUS_VALUES.has(normalized) ? normalized : null;
}

function normalizeNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  const n =
    typeof value === "object" && typeof value.toString === "function"
      ? Number(value.toString())
      : Number(value);

  return Number.isFinite(n) ? n : null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim() !== "");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === "string" && item.trim() !== "")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function mapPostToApi(post, viewerUserId) {
  const isOwner = post.user_id === viewerUserId;
  const photoVerificationStatus = normalizePhotoVerificationStatus(post.photo_verification_status);

  return {
    id: post.id,
    userId: post.user_id,
    title: post.title,
    content: post.content,
    latitude: post.latitude,
    longitude: post.longitude,
    locationName: post.location_name,
    city: post.city,
    country: post.country,
    placeCategory: normalizePlaceCategory(post.place_category),
    osmClass: normalizeOptionalText(post.osm_class),
    osmSubtype: normalizeOptionalText(post.osm_subtype),
    addressType: normalizeOptionalText(post.address_type),
    sentiment: post.sentiment,
    sentimentScore: normalizeNullableNumber(post.sentiment_score),
    privacy: post.privacy,
    photoVerification: {
      status: photoVerificationStatus,
      checkedAt: post.photo_verification_checked_at ?? null,
      confidence: normalizeNullableNumber(post.photo_verification_confidence),
      distanceMeters: normalizeNullableNumber(post.photo_verification_distance_meters),
      detectedName: normalizeOptionalText(post.photo_verification_detected_name),
      reasons: normalizeStringArray(post.photo_verification_reasons),
      provider: normalizeOptionalText(post.photo_verification_provider)
    },
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    isOwner,
    canEdit: isOwner,
    canDelete: isOwner,
    images: (post.images || []).map((img) => ({
      id: img.id,
      secureUrl: img.secure_url,
      publicId: img.public_id,
      displayOrder: img.display_order,
      createdAt: img.created_at
    }))
  };
}

export function mapMapFeedRowToApi(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    title: row.title,
    contentPreview: row.content_preview,
    locationName: row.location_name,
    placeCategory: normalizePlaceCategory(row.place_category),
    latitude: row.latitude,
    longitude: row.longitude,
    sentiment: row.sentiment,
    sentimentScore: normalizeNullableNumber(row.sentiment_score),
    privacy: row.privacy,
    createdAt: row.created_at,
    imageCount: Number(row.image_count || 0),
    previewImage: row.preview_image || null
  };
}