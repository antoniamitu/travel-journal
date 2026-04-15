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

function normalizePlaceCategory(value) {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.trim().toLowerCase();
  return PLACE_CATEGORY_VALUES.has(normalized) ? normalized : "other";
}

export function mapPostToApi(post, viewerUserId) {
  const isOwner = post.user_id === viewerUserId;

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
    sentiment: post.sentiment,
    privacy: post.privacy,
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
    privacy: row.privacy,
    createdAt: row.created_at,
    imageCount: Number(row.image_count || 0),
    previewImage: row.preview_image || null
  };
}