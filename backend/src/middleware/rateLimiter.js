// src/middleware/rateLimiter.js
import rateLimit from "express-rate-limit";

/**
 * PRD:
 * - Register: 10 attempts / hour / IP (counts ALL)
 * - Login: 5 failed / 15 min / IP (skipSuccessfulRequests: true)
 */

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts from this IP, please try again in an hour" }
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts from this IP, please try again in 15 minutes" }
});