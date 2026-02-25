// backend/src/validators/auth.validator.js
import { z } from "zod";

// Allow: letters, numbers, dot, underscore, hyphen
const usernameRegex = /^[a-zA-Z0-9._-]+$/;

// Practical email validation (no deprecated .email())
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * IMPORTANT (production hardening):
 * - If attacker sends email: null / number / object, Zod would normally respond "Expected string".
 * - PRD wants stable messages: "Email is required", "Password is required", etc.
 * So we coerce non-strings to "" to let .min(1, ...) control the message.
 */
const trimOrEmpty = (val) => (typeof val === "string" ? val.trim() : "");
const asStringOrEmpty = (val) => (typeof val === "string" ? val : "");

export const registerSchema = z.object({
  email: z.preprocess(
    trimOrEmpty,
    z
      .string()
      .min(1, "Email is required")
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
      // Allow dots, but forbid consecutive dots
      .refine((v) => !v.includes(".."), "Username cannot contain consecutive dots")
      .refine(
        (v) => usernameRegex.test(v),
        "Username can only contain letters, numbers, dot, underscore and hyphen"
      )
  ),

  // Do NOT trim/normalize passwords (spaces can be intentional)
  password: z.preprocess(asStringOrEmpty, z.string().min(6, "Password must be at least 6 characters"))
});

export const loginSchema = z.object({
  email: z.preprocess(
    trimOrEmpty,
    z
      .string()
      .min(1, "Email is required")
      .refine((v) => emailRegex.test(v), "Please enter a valid email address")
      .transform((v) => v.toLowerCase())
  ),

  // PRD: only "required" at login (do not enforce min length here)
  password: z.preprocess(asStringOrEmpty, z.string().min(1, "Password is required"))
});