// backend/src/routes/geocode.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireJsonBody } from "../utils/requireJsonBody.js";
import { search, reverse } from "../controllers/geocode.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "geocode" });
  })
);

router.post("/search", requireAuth, requireJsonBody, asyncHandler(search));
router.post("/reverse", requireAuth, requireJsonBody, asyncHandler(reverse));

export default router;