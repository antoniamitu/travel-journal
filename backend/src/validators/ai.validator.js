// backend/src/validators/ai.validator.js
import { z } from "zod";
import { latParam, lngParam, trimOrEmpty } from "./shared.js";

const emptyToUndefined = (val) => {
  const s = trimOrEmpty(val);
  return s === "" ? undefined : s;
};

export const learnMoreSchema = z
  .object({
    locationName: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(1, "locationName is required")
        .max(500, "locationName must be at most 500 characters")
    ),

    city: z.preprocess(
      emptyToUndefined,
      z.string().max(100, "city must be at most 100 characters").optional()
    ),

    country: z.preprocess(
      emptyToUndefined,
      z.string().max(100, "country must be at most 100 characters").optional()
    ),

    latitude: latParam("Latitude"),
    longitude: lngParam("Longitude")
  })
  .strict();