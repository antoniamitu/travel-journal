// backend/src/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { ENV } from "../config/env.js";
import { getPrisma } from "../config/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { formatZodErrors } from "../utils/formatZodErrors.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, ENV.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "24h"
  });
}

// Prevent timing attacks / user enumeration on login
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password", 10);

export async function register(req, res) {
  // requireJsonBody is now route middleware, so req.body is guaranteed to be a plain object
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const { email, username, password } = parsed.data;
  const prisma = getPrisma();
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email, username, password_hash },
      select: { id: true, email: true, username: true }
    });

    const token = signToken(user.id);
    return res.status(201).json({ user, token });
  } catch (err) {
    // Prisma unique constraint
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

export async function login(req, res) {
  // requireJsonBody is now route middleware, so req.body is guaranteed to be a plain object
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", formatZodErrors(parsed.error));
  }

  const { email, password } = parsed.data;
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, password_hash: true }
  });

  if (!user) {
    // timing equalization
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new HttpError(401, "Invalid credentials");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new HttpError(401, "Invalid credentials");
  }

  const token = signToken(user.id);
  return res.status(200).json({
    user: { id: user.id, email: user.email, username: user.username },
    token
  });
}

export async function me(req, res) {
  const userId = req.userId;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, "Unauthorized");
  }

  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true }
  });

  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  return res.status(200).json({ user });
}