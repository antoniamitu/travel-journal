// backend/src/validators/uploads.validator.js
import { z } from "zod";
import { publicIdSchema } from "./shared.js";

export const uploadsCleanupSchema = z
  .object({
    publicIds: z
      .array(publicIdSchema)
      .min(1, "At least one publicId is required")
      .max(30, "Too many publicIds (max 30 per request)")
  })
  .strict()
  .superRefine((data, ctx) => {
    const unique = new Set(data.publicIds);

    if (unique.size !== data.publicIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["publicIds"],
        message: "publicIds must not contain duplicates"
      });
    }
  });