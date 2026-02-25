// src/validators/auth.validator.js
import { z } from "zod";

// Allow: letters, numbers, dot, underscore, hyphen
const usernameRegex = /^[a-zA-Z0-9._-]+$/;

// Practical email validation (no deprecated .email())
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper: trim strings safely (preprocess runs BEFORE validations)
const trimString = (val) => (typeof val === "string" ? val.trim() : val);

export const registerSchema = z.object({
  email: z.preprocess(
    trimString,
    z
      .string()
      .min(1, "Email is required")
      .refine((v) => emailRegex.test(v), "Please enter a valid email address")
      .transform((v) => v.toLowerCase())
  ),

  username: z.preprocess(
    trimString,
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

  // Do NOT trim/normalize passwords (spaces can be intentional)
  password: z.string().min(6, "Password must be at least 6 characters")
});