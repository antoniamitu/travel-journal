// src/middleware/errorHandler.js
export function notFoundHandler(req, res) {
  res.status(404).json({ message: "Not found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // 1) Invalid JSON body (thrown by express.json)
  // Covers multiple express/body-parser variants.
  if (
    err instanceof SyntaxError &&
    (err?.status === 400 || err?.statusCode === 400 || err?.type === "entity.parse.failed")
  ) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  const rawMessage = String(err?.message || "");

  // 2) CORS block (do not leak the blocked origin)
  if (rawMessage.startsWith("Origin not allowed by CORS:")) {
    return res.status(403).json({ message: "Origin not allowed" });
  }

  // 3) HttpError (or any error using `statusCode`)
  const statusCode = Number(err?.statusCode);
  if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600) {
    // Do NOT leak details for 500-level errors
    if (statusCode >= 500) {
      console.error(err);
      return res.status(statusCode).json({ message: "Internal server error" });
    }

    // 4xx errors are safe to send (validation/auth/user-facing)
    return res.status(statusCode).json({ message: err?.message || "Request failed" });
  }

  // 4) Fallback (unknown/unhandled errors)
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
}