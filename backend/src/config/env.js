// src/config/env.js
import { z } from "zod";

const normalizeOrigin = (v) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.endsWith("/") ? s.slice(0, -1) : s;
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
    FRONTEND_URL_DEV: z.string().optional().transform(normalizeOrigin)
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