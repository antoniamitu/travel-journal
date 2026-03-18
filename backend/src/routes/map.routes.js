// backend/src/routes/map.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mapReadLimiter } from "../middleware/mapReadLimiter.js";
import { getPostsInBounds } from "../controllers/map.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "map" });
  })
);

router.get("/posts", requireAuth, mapReadLimiter, asyncHandler(getPostsInBounds));

export default router;