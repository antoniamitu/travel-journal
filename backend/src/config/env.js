// backend/src/config/env.js
import { z } from "zod";

const normalizeOrigin = (v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.endsWith("/") ? s.slice(0, -1) : s;
};

const normalizeUrlNoTrailingSlash = (v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.endsWith("/") ? s.slice(0, -1) : s;
};

const normalizeCloudinaryFolder = (s) => {
  let out = typeof s === "string" ? s.trim() : "";
  if (!out) out = "travel-journal";

  out = out.replace(/\\/g, "/");
  out = out.replace(/^\/+/, "").replace(/\/+$/, "");
  out = out.replace(/\/{2,}/g, "/");

  return out;
};

const normalizeOptionalTrimmed = (v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s || undefined;
};

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    PORT: z.coerce
      .number()
      .int("PORT must be an integer")
      .min(1, "PORT must be between 1 and 65535")
      .max(65535, "PORT must be between 1 and 65535")
      .default(3000),

    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),

    JWT_SECRET: z.string().trim().min(32, "JWT_SECRET must be at least 32 characters"),

    FRONTEND_URL: z.string().optional().transform(normalizeOrigin),
    FRONTEND_URL_DEV: z.string().optional().transform(normalizeOrigin),

    // PRD #2 — Nominatim
    NOMINATIM_USER_AGENT: z.string().trim().min(10, "NOMINATIM_USER_AGENT is required"),

    NOMINATIM_BASE_URL: z
      .string()
      .trim()
      .min(1, "NOMINATIM_BASE_URL is required")
      .default("https://nominatim.openstreetmap.org")
      .transform(normalizeUrlNoTrailingSlash),

    // PRD #3 — Cloudinary
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .trim()
      .min(1, "CLOUDINARY_CLOUD_NAME is required")
      .refine((v) => /^[a-z0-9_-]+$/i.test(v), "CLOUDINARY_CLOUD_NAME has invalid characters"),

    CLOUDINARY_API_KEY: z
      .string()
      .trim()
      .min(1, "CLOUDINARY_API_KEY is required")
      .refine((v) => /^\d+$/.test(v), "CLOUDINARY_API_KEY must contain only digits"),

    CLOUDINARY_API_SECRET: z.string().trim().min(1, "CLOUDINARY_API_SECRET is required"),

    CLOUDINARY_FOLDER: z
      .string()
      .trim()
      .default("travel-journal")
      .transform(normalizeCloudinaryFolder)
      .refine((v) => v.length > 0, "CLOUDINARY_FOLDER is required")
      .refine((v) => v.length <= 80, "CLOUDINARY_FOLDER too long (max 80 chars)")
      .refine((v) => !v.includes(".."), "CLOUDINARY_FOLDER must not contain '..'")
      .refine(
        (v) => /^[a-zA-Z0-9/_-]+$/.test(v),
        "CLOUDINARY_FOLDER may contain only letters, digits, '/', '_', '-'"
      ),

    // PRD #4 — Gemini AI
    GEMINI_API_KEY: z.string().trim().min(1, "GEMINI_API_KEY is required"),

    GEMINI_MODEL: z
      .string()
      .optional()
      .transform(normalizeOptionalTrimmed)
      .pipe(z.string().min(1, "GEMINI_MODEL cannot be empty").default("gemini-2.5-flash")),

    AI_LEARN_MORE_WINDOW_MS: z.coerce
      .number()
      .int("AI_LEARN_MORE_WINDOW_MS must be an integer")
      .min(1_000, "AI_LEARN_MORE_WINDOW_MS must be at least 1000 ms")
      .max(3_600_000, "AI_LEARN_MORE_WINDOW_MS must be at most 3600000 ms")
      .default(60_000),

    AI_LEARN_MORE_MAX_PER_WINDOW: z.coerce
      .number()
      .int("AI_LEARN_MORE_MAX_PER_WINDOW must be an integer")
      .min(1, "AI_LEARN_MORE_MAX_PER_WINDOW must be at least 1")
      .max(1_000, "AI_LEARN_MORE_MAX_PER_WINDOW must be at most 1000")
      .default(10),

    AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW: z.coerce
      .number()
      .int("AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW must be an integer")
      .min(1, "AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW must be at least 1")
      .max(10_000, "AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW must be at most 10000")
      .default(60),

    AI_CACHE_TTL_DAYS: z.coerce
      .number()
      .int("AI_CACHE_TTL_DAYS must be an integer")
      .min(1, "AI_CACHE_TTL_DAYS must be at least 1")
      .max(365, "AI_CACHE_TTL_DAYS must be at most 365")
      .default(30),

    AI_UPSTREAM_TIMEOUT_MS: z.coerce
      .number()
      .int("AI_UPSTREAM_TIMEOUT_MS must be an integer")
      .min(1_000, "AI_UPSTREAM_TIMEOUT_MS must be at least 1000 ms")
      .max(60_000, "AI_UPSTREAM_TIMEOUT_MS must be at most 60000 ms")
      .default(15_000),

    AI_RETRY_ATTEMPTS: z.coerce
      .number()
      .int("AI_RETRY_ATTEMPTS must be an integer")
      .min(1, "AI_RETRY_ATTEMPTS must be at least 1")
      .max(5, "AI_RETRY_ATTEMPTS must be at most 5")
      .default(3),

    AI_RETRY_BASE_DELAY_MS: z.coerce
      .number()
      .int("AI_RETRY_BASE_DELAY_MS must be an integer")
      .min(0, "AI_RETRY_BASE_DELAY_MS must be at least 0 ms")
      .max(10_000, "AI_RETRY_BASE_DELAY_MS must be at most 10000 ms")
      .default(500)
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "development" && !env.FRONTEND_URL_DEV) {
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_URL_DEV"],
        message: "FRONTEND_URL_DEV is required in development (e.g., http://localhost:5173)"
      });
    }

    if (env.NODE_ENV === "production" && !env.FRONTEND_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL is required in production (your Vercel URL)"
      });
    }

    if (env.NOMINATIM_BASE_URL && !/^https?:\/\//i.test(env.NOMINATIM_BASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["NOMINATIM_BASE_URL"],
        message: "NOMINATIM_BASE_URL must start with http:// or https://"
      });
    }

    if (env.AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW < env.AI_LEARN_MORE_MAX_PER_WINDOW) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW"],
        message:
          "AI_LEARN_MORE_GLOBAL_MAX_PER_WINDOW should be greater than or equal to AI_LEARN_MORE_MAX_PER_WINDOW"
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    console.error(`- ${path}: ${issue.message}`);
  }
  throw new Error("Environment validation failed");
}

export const ENV = parsed.data;