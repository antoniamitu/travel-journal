// backend/src/utils/requireJsonBody.js
export function requireJsonBody(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({
      message: "Validation failed",
      errors: { general: "Invalid request body" }
    });
    return { ok: false };
  }

  return { ok: true };
}