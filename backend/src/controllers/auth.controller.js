// src/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { ENV } from "../config/env.js";
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { registerSchema } from "../validators/auth.validator.js";

function fieldErrorsFromZod(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const key = issue.path?.[0] || "general";
    if (!errors[key]) errors[key] = issue.message; // keep first message per field
  }
  return errors;
}

function signToken(userId) {
  // PRD: token payload contains only `sub` claim
  return jwt.sign({ sub: String(userId) }, ENV.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "24h"
  });
}

export async function register(req, res) {
  // Extra safety: refuse non-object body (null, arrays, etc.)
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: { general: "Invalid request body" }
    });
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: fieldErrorsFromZod(parsed.error)
    });
  }

  const { email, username, password } = parsed.data;

  const prisma = getPrisma();

  // PRD: bcrypt cost factor 10
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email, username, password_hash },
      select: { id: true, email: true, username: true }
    });

    const token = signToken(user.id);
    return res.status(201).json({ user, token });
  } catch (err) {
    // Prisma unique constraint violation
    if (err?.code === "P2002") {
      const target = err?.meta?.target;
      const t = Array.isArray(target) ? target.join(",") : String(target || "");

      if (t.includes("email")) {
        throw new HttpError(
          409,
          "This email is already registered. Please login or use a different email."
        );
      }
      if (t.includes("username")) {
        throw new HttpError(409, "This username is already taken. Please choose another.");
      }
      throw new HttpError(409, "Account already exists");
    }

    throw err;
  }
}