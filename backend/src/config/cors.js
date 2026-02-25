// src/config/cors.js
import cors from "cors";
import { ENV } from "./env.js";

function getAllowedOrigins() {
  return [ENV.FRONTEND_URL, ENV.FRONTEND_URL_DEV].filter(Boolean);
}

export function corsMiddleware() {
  const allowed = getAllowedOrigins();

  return cors({
    origin(origin, cb) {
      // Non-browser clients (Postman, curl) may omit Origin
      if (!origin) return cb(null, true);

      // Safety net: if misconfigured, fail closed
      if (allowed.length === 0) {
        return cb(new Error(`Origin not allowed by CORS: ${origin}`));
      }

      if (allowed.includes(origin)) return cb(null, true);

      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Length"],
    maxAge: 86400
  });
}