import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerLimiter } from "../middleware/rateLimiter.js";
import { register } from "../controllers/auth.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "auth" });
  })
);

router.post("/register", registerLimiter, asyncHandler(register));

export default router;