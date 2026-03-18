// backend/src/validators/map.validator.js
import { z } from "zod";
import { latParam, lngParam } from "./shared.js";

export const mapPostsQuerySchema = z
  .object({
    northLat: latParam("northLat"),
    southLat: latParam("southLat"),
    eastLng: lngParam("eastLng"),
    westLng: lngParam("westLng")
  })
  .superRefine((data, ctx) => {
    if (data.northLat < data.southLat) {
      ctx.addIssue({
        code: "custom",
        path: ["southLat"],
        message: "southLat must be less than or equal to northLat"
      });
    }

    // MVP rule from PRD:
    // anti-meridian crossing is NOT supported yet.
    if (data.eastLng < data.westLng) {
      ctx.addIssue({
        code: "custom",
        path: ["eastLng"],
        message:
          "eastLng must be greater than or equal to westLng (anti-meridian crossing not supported in MVP)"
      });
    }
  });