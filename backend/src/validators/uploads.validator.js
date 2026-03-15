// backend/src/validators/uploads.validator.js
import { z } from "zod";

// allow dots too (filenames like "my.photo" can become public_id)
// BUT forbid traversal-like patterns and weird separators.
const PUBLIC_ID_RE = /^[a-zA-Z0-9/_.-]+$/;

const publicIdSchema = z
  .string()
  .trim()
  .min(1, "publicId is required")
  .max(200, "publicId too long")
  .refine((v) => PUBLIC_ID_RE.test(v), "publicId has invalid characters")
  .refine((v) => !v.includes(".."), "publicId must not contain '..'")
  .refine((v) => !v.includes("\\"), "publicId must not contain backslashes")
  .refine((v) => !v.includes("//"), "publicId must not contain '//'");

export const uploadsCleanupSchema = z.object({
  publicIds: z
    .array(publicIdSchema)
    .min(1, "At least one publicId is required")
    .max(30, "Too many publicIds (max 30 per request)")
});