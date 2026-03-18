// backend/src/validators/ai.validator.js
import { z } from "zod";
import { asNumberOrUndefined } from "./shared.js";

const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");

const emptyToUndefined = (val) => {
  const s = trimOrEmpty(val);
  return s === "" ? undefined : s;
};

export const learnMoreSchema = z.object({
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
  )
});