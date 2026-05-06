export function getPreviewImage(post) {
  if (Array.isArray(post?.previewImages) && post.previewImages.length > 0) {
    const first = post.previewImages.find(
      (item) => typeof item === "string" && item.trim() !== ""
    );

    if (first) return first;
  }

  if (typeof post?.previewImage === "string" && post.previewImage.trim()) {
    return post.previewImage;
  }

  return "";
}

export function getPostLocation(post, fallback = "Unknown location") {
  const parts = [post?.city, post?.country].filter(
    (item) => typeof item === "string" && item.trim() !== ""
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  const locationName = String(post?.locationName || "").trim();
  return locationName || fallback;
}

export function hasValidCoordinatePair(latValue, lngValue) {
  const lat = Number(latValue);
  const lng = Number(lngValue);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function hasValidPostCoordinates(post) {
  return hasValidCoordinatePair(post?.latitude, post?.longitude);
}

export function getAvatarInitials(sourceObject, fallback = "U") {
  const source = String(
    sourceObject?.username || sourceObject?.email || fallback
  ).trim();

  if (!source) return fallback;

  const parts = source.replace(/[@._-]+/g, " ").split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function getAuthorInitials(post) {
  return getAvatarInitials(post, "T");
}