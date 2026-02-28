// backend/src/config/cors.js
import cors from "cors";
import { ENV } from "./env.js";

function getAllowedOrigins() {
  // normalizeOrigin din env.js îți scoate trailing slash, deci comparația e stabilă
  return [ENV.FRONTEND_URL, ENV.FRONTEND_URL_DEV].filter(Boolean);
}

export function corsMiddleware() {
  const allowed = getAllowedOrigins();

  return cors({
    origin(origin, cb) {
      // Non-browser clients (Postman, curl) may omit Origin
      if (!origin) return cb(null, true);

      // Fail-closed (no allowlist configured) => block CORS (without throwing)
      if (allowed.length === 0) return cb(null, false);

      // Allow only exact matches from env allowlist
      if (allowed.includes(origin)) return cb(null, true);

      // Block silently: browser will enforce it, and we avoid turning it into a 500
      return cb(null, false);
    },

    // We use Bearer tokens, NOT cookies
    credentials: false,

    // Include PATCH for future edit endpoints
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Length"],

    // Cache preflight for 24h
    maxAge: 86400,

    // Some legacy clients/proxies expect 200 for OPTIONS
    optionsSuccessStatus: 200
  });
}