// backend/src/validators/auth.validator.js
import { z } from "zod";

// Allow: letters, numbers, dot, underscore, hyphen
const usernameRegex = /^[a-zA-Z0-9._-]+$/;

// Practical email validation for application-level input checks.
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MAX_LENGTH = 255;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

/**
 * Stable user-facing validation:
 * non-string values become "" so required/min-length messages stay predictable.
 */
const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");
const asStringOrEmpty = (val) => (typeof val === "string" ? val : "");

export const registerSchema = z
  .object({
    email: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(1, "Email is required")
        .max(EMAIL_MAX_LENGTH, "Email must be at most 255 characters")
        .refine((v) => emailRegex.test(v), "Please enter a valid email address")
        .transform((v) => v.toLowerCase())
    ),

    username: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(3, "Username must be 3-20 characters")
        .max(20, "Username must be 3-20 characters")
        .refine((v) => /^[a-zA-Z0-9]/.test(v), "Username must start with a letter or number")
        .refine((v) => /[a-zA-Z0-9]$/.test(v), "Username must end with a letter or number")
        .refine((v) => !v.includes(".."), "Username cannot contain consecutive dots")
        .refine(
          (v) => usernameRegex.test(v),
          "Username can only contain letters, numbers, dot, underscore and hyphen"
        )
    ),

    // Do NOT trim/normalize passwords. Spaces can be intentional.
    password: z.preprocess(
      asStringOrEmpty,
      z
        .string()
        .min(PASSWORD_MIN_LENGTH, "Password must be at least 6 characters")
        .max(PASSWORD_MAX_LENGTH, "Password must be at most 72 characters")
    )
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.preprocess(
      trimOrEmpty,
      z
        .string()
        .min(1, "Email is required")
        .max(EMAIL_MAX_LENGTH, "Email must be at most 255 characters")
        .refine((v) => emailRegex.test(v), "Please enter a valid email address")
        .transform((v) => v.toLowerCase())
    ),

    password: z.preprocess(
      asStringOrEmpty,
      z
        .string()
        .min(1, "Password is required")
        .max(PASSWORD_MAX_LENGTH, "Password must be at most 72 characters")
    )
  })
  .strict();