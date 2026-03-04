// backend/src/routes/auth.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerLimiter, loginLimiter } from "../middleware/rateLimiter.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireJsonBody } from "../utils/requireJsonBody.js";
import { register, login, me } from "../controllers/auth.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "auth" });
  })
);

router.post("/register", registerLimiter, requireJsonBody, asyncHandler(register));
router.post("/login", loginLimiter, requireJsonBody, asyncHandler(login));

// Feature 1.3
router.get("/me", requireAuth, asyncHandler(me));

export default router;