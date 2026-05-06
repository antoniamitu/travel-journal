// backend/src/validators/shared.js
import { z } from "zod";

const PUBLIC_ID_RE = /^[a-zA-Z0-9/_.-]+$/;

export function trimOrEmpty(val) {
  return typeof val === "string" ? val.trim() : "";
}

export function asNumberOrUndefined(val) {
  if (typeof val === "number") return val;

  if (typeof val === "string") {
    const s = val.trim();
    if (s === "") return undefined;

    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }

  if (val == null) return undefined;

  return val;
}

export function latParam(name) {
  return z.preprocess(
    asNumberOrUndefined,
    z
      .number({
        required_error: `${name} is required`,
        invalid_type_error: `${name} must be a number`
      })
      .refine(Number.isFinite, { message: `${name} must be a finite number` })
      .min(-90, `${name} must be between -90 and 90`)
      .max(90, `${name} must be between -90 and 90`)
  );
}

export function lngParam(name) {
  return z.preprocess(
    asNumberOrUndefined,
    z
      .number({
        required_error: `${name} is required`,
        invalid_type_error: `${name} must be a number`
      })
      .refine(Number.isFinite, { message: `${name} must be a finite number` })
      .min(-180, `${name} must be between -180 and 180`)
      .max(180, `${name} must be between -180 and 180`)
  );
}

export const publicIdSchema = z
  .string()
  .trim()
  .min(1, "publicId is required")
  .max(200, "publicId too long")
  .refine((v) => PUBLIC_ID_RE.test(v), "publicId has invalid characters")
  .refine((v) => !v.includes(".."), "publicId must not contain '..'")
  .refine((v) => !v.includes("\\"), "publicId must not contain backslashes")
  .refine((v) => !v.includes("//"), "publicId must not contain '//'");