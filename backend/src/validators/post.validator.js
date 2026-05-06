// backend/src/validators/post.validator.js
import { z } from "zod";
import { PRIVACY_VALUES } from "../constants/privacy.js";
import { asNumberOrUndefined, publicIdSchema } from "./shared.js";
import {
  normalizeLocationDisplayText,
  normalizeOptionalLocationText
} from "../utils/locationText.js";

const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");
const trimLowerOrEmpty = (val) => (typeof val === "string" ? val.trim().toLowerCase() : "");

function optionalTrimmedStringOrUndefined(val) {
  if (val == null) return undefined;
  if (typeof val !== "string") return val;

  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
}

const imageSchema = z.object({
  secureUrl: z.preprocess(
    trimOrEmpty,
    z
      .string()
      .url("secureUrl must be a valid URL")
      .max(500, "secureUrl too long")
      .refine((u) => u.startsWith("https://"), "secureUrl must start with https://")
  ),
  publicId: z.preprocess(trimOrEmpty, publicIdSchema)
});

const postBodySchema = z
  .object({
    title: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(3, "Title must be at least 3 characters")
        .max(100, "Title must be at most 100 characters")
    ),

    content: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(10, "Content must be at least 10 characters")
        .max(2000, "Content cannot exceed 2000 characters")
    ),

    latitude: z.preprocess(
      asNumberOrUndefined,
      z
        .number({ invalid_type_error: "Latitude must be a number" })
        .refine(Number.isFinite, { message: "Latitude must be a finite number" })
        .min(-90, "Latitude must be between -90 and 90")
        .max(90, "Latitude must be between -90 and 90")
    ),

    longitude: z.preprocess(
      asNumberOrUndefined,
      z
        .number({ invalid_type_error: "Longitude must be a number" })
        .refine(Number.isFinite, { message: "Longitude must be a finite number" })
        .min(-180, "Longitude must be between -180 and 180")
        .max(180, "Longitude must be between -180 and 180")
    ),

    locationName: z.preprocess(
      normalizeLocationDisplayText,
      z
        .string()
        .min(1, "locationName is required")
        .max(500, "locationName must be at most 500 characters")
    ),

    city: z.preprocess(
      normalizeOptionalLocationText,
      z.string().max(100, "city must be at most 100 characters").optional()
    ),

    country: z.preprocess(
      normalizeOptionalLocationText,
      z.string().max(100, "country must be at most 100 characters").optional()
    ),

    // Optional Nominatim metadata/signals used only by backend classification.
    // Frontend does not choose category manually.
    displayName: z.preprocess(
      optionalTrimmedStringOrUndefined,
      z.string().max(1200, "displayName must be at most 1200 characters").optional()
    ),

    osmClass: z.preprocess(
      optionalTrimmedStringOrUndefined,
      z.string().max(50, "osmClass must be at most 50 characters").optional()
    ),

    osmSubtype: z.preprocess(
      optionalTrimmedStringOrUndefined,
      z.string().max(100, "osmSubtype must be at most 100 characters").optional()
    ),

    addressType: z.preprocess(
      optionalTrimmedStringOrUndefined,
      z.string().max(50, "addressType must be at most 50 characters").optional()
    ),

    privacy: z
      .preprocess(trimLowerOrEmpty, z.string())
      .refine((v) => PRIVACY_VALUES.includes(v), "privacy must be one of: private, public"),

    images: z.array(imageSchema).max(6, "Maximum 6 images per post").default([])
  })
  .strict()
  .superRefine((data, ctx) => {
    const ids = data.images.map((x) => x.publicId);
    const set = new Set(ids);

    if (set.size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "images contains duplicate publicId values"
      });
    }
  });

// Create and update share the same schema because this API uses full-body PUT semantics:
// the complete post payload is required for both operations.
export const createPostSchema = postBodySchema;
export const updatePostSchema = postBodySchema;

// Express route params come in as strings, so validate as string first
// to keep the error message consistent for 0, -1, abc, empty, etc.
export const postIdParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[1-9]\d*$/, "id must be a positive integer")
    .transform((v) => Number(v))
    .refine(
      (v) => Number.isSafeInteger(v) && v <= 2147483647,
      "id is too large"
    )
});