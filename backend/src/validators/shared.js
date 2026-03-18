// backend/src/validators/shared.js
import { z } from "zod";

export function asNumberOrUndefined(val) {
  if (typeof val === "number") return val;

  if (typeof val === "string") {
    const s = val.trim();
    if (s === "") return undefined;

    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

export function latParam(name) {
  return z.preprocess(
    asNumberOrUndefined,
    z
      .number({ invalid_type_error: `${name} must be a number` })
      .refine(Number.isFinite, { message: `${name} must be a finite number` })
      .min(-90, `${name} must be between -90 and 90`)
      .max(90, `${name} must be between -90 and 90`)
  );
}

export function lngParam(name) {
  return z.preprocess(
    asNumberOrUndefined,
    z
      .number({ invalid_type_error: `${name} must be a number` })
      .refine(Number.isFinite, { message: `${name} must be a finite number` })
      .min(-180, `${name} must be between -180 and 180`)
      .max(180, `${name} must be between -180 and 180`)
  );
}