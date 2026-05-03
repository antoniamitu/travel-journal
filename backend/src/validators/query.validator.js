// backend/src/validators/query.validator.js
import { z } from "zod";
import { asNumberOrUndefined } from "./shared.js";

const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");

export const geocodeSearchSchema = z.object({
  query: z.preprocess(
    trimOrEmpty,
    z
      .string()
      .min(3, "Query must be at least 3 characters")
      .max(120, "Query must be at most 120 characters")
  )
});

export const geocodeReverseSchema = z.object({
  lat: z.preprocess(
    asNumberOrUndefined,
    z
      .number({ invalid_type_error: "Latitude must be a number" })
      .refine(Number.isFinite, { message: "Latitude must be a finite number" })
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90")
  ),
  lng: z.preprocess(
    asNumberOrUndefined,
    z
      .number({ invalid_type_error: "Longitude must be a number" })
      .refine(Number.isFinite, { message: "Longitude must be a finite number" })
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180")
  )
});

export const geocodePhotoSuggestionSchema = z.object({
  imageUrl: z
    .preprocess(
      trimOrEmpty,
      z
        .string()
        .url("imageUrl must be a valid URL")
        .max(1000, "imageUrl must be at most 1000 characters")
    )
    .refine((value) => value.startsWith("https://"), {
      message: "imageUrl must use https"
    }),

  publicId: z.preprocess(
    trimOrEmpty,
    z
      .string()
      .min(1, "publicId is required")
      .max(255, "publicId must be at most 255 characters")
  )
});