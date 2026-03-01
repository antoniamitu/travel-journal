// backend/src/validators/query.validator.js
import { z } from "zod";

const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");

// accepts number OR numeric string; returns undefined if cannot convert
const asNumberOrUndefined = (val) => {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const s = val.trim();
    if (s === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

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