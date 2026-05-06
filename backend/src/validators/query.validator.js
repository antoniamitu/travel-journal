// backend/src/validators/query.validator.js
import { z } from "zod";
import { latParam, lngParam, publicIdSchema, trimOrEmpty } from "./shared.js";

export const geocodeSearchSchema = z
  .object({
    query: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(3, "Query must be at least 3 characters")
        .max(120, "Query must be at most 120 characters")
    )
  })
  .strict();

export const geocodeReverseSchema = z
  .object({
    lat: latParam("Latitude"),
    lng: lngParam("Longitude")
  })
  .strict();

export const geocodePhotoSuggestionSchema = z
  .object({
    imageUrl: z
      .preprocess(
        trimOrEmpty,
        z
          .string()
          .url("imageUrl must be a valid URL")
          .max(500, "imageUrl must be at most 500 characters")
      )
      .refine((value) => value.startsWith("https://"), {
        message: "imageUrl must use https"
      }),

    publicId: z.preprocess(trimOrEmpty, publicIdSchema)
  })
  .strict();