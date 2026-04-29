// frontend/src/utils/cloudinaryImage.js

const CLOUDINARY_UPLOAD_SEGMENT = "/upload/";

export function isCloudinaryUrl(url) {
  if (typeof url !== "string") return false;

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      parsed.pathname.includes(CLOUDINARY_UPLOAD_SEGMENT)
    );
  } catch {
    return false;
  }
}

function looksLikeCloudinaryTransform(segment) {
  if (typeof segment !== "string" || !segment.trim()) return false;

  return /(^|,)(c_|w_|h_|g_|f_|q_|e_|dpr_|ar_|r_|b_|co_|fl_|l_|o_|u_|x_|y_|z_)/.test(
    segment
  );
}

export function transformCloudinaryUrl(url, transform) {
  if (!isCloudinaryUrl(url)) {
    return url || "";
  }

  const safeTransform = String(transform || "").trim();
  if (!safeTransform) {
    return url;
  }

  const uploadIndex = url.indexOf(CLOUDINARY_UPLOAD_SEGMENT);
  const prefix = url.slice(0, uploadIndex + CLOUDINARY_UPLOAD_SEGMENT.length);
  const suffix = url.slice(uploadIndex + CLOUDINARY_UPLOAD_SEGMENT.length);

  const segments = suffix.split("/");
  const firstSegment = segments[0] || "";

  if (looksLikeCloudinaryTransform(firstSegment)) {
    segments.shift();
  }

  return `${prefix}${safeTransform}/${segments.join("/")}`;
}

export function makeCloudinaryOptimizer(variantTransforms, defaultVariant = "default") {
  return function optimizeCloudinaryUrl(url, variant = defaultVariant) {
    const transforms = variantTransforms && typeof variantTransforms === "object"
      ? variantTransforms
      : {};

    const transform = transforms[variant] || transforms[defaultVariant] || transforms.default;
    return transformCloudinaryUrl(url, transform);
  };
}

export function buildCloudinarySrcSet(secureUrl, options) {
  if (!isCloudinaryUrl(secureUrl)) return undefined;

  const {
    widths = [],
    crop = "limit",
    gravity = "auto",
    height,
    quality = "auto",
    format = "auto"
  } = options || {};

  const normalizedWidths = Array.from(
    new Set(widths.filter((value) => Number.isFinite(value) && value > 0))
  ).sort((a, b) => a - b);

  if (!normalizedWidths.length) return undefined;

  return normalizedWidths
    .map((width) => {
      const parts = [`c_${crop}`, `w_${width}`];

      if (crop === "fill") {
        parts.push(`g_${gravity}`);
      }

      if (Number.isFinite(height) && height > 0) {
        parts.push(`h_${height}`);
      }

      parts.push(`f_${format}`, `q_${quality}`);

      return `${transformCloudinaryUrl(secureUrl, parts.join(","))} ${width}w`;
    })
    .join(", ");
}