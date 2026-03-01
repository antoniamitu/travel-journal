// backend/src/middleware/errorHandler.js
export function notFoundHandler(req, res) {
  res.status(404).json({ message: "Not found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Invalid JSON body (thrown by express.json)
  if (
    err instanceof SyntaxError &&
    (err?.status === 400 || err?.statusCode === 400 || err?.type === "entity.parse.failed")
  ) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  const statusCode = Number(err?.statusCode);

  // Controlled HttpError
  if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600) {
    // ✅ safe, user-facing geocoding errors
    const safe5xx = new Set([502, 503, 504]);

    if (statusCode >= 500 && !safe5xx.has(statusCode)) {
      console.error(err);
      return res.status(statusCode).json({ message: "Internal server error" });
    }

    return res.status(statusCode).json({ message: err?.message || "Request failed" });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
}