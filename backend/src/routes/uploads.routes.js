// backend/src/routes/uploads.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireJsonBody } from "../utils/requireJsonBody.js";
import { sign, cleanup } from "../controllers/uploads.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "uploads" });
  })
);

// sign does NOT requireJsonBody (frontend may send empty body)
router.post("/sign", requireAuth, asyncHandler(sign));

// cleanup DOES require JSON body
router.post("/cleanup", requireAuth, requireJsonBody, asyncHandler(cleanup));

export default router;