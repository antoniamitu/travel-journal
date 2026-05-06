// backend/src/routes/dashboard.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { profileReadLimiter } from "../middleware/profileReadLimiter.js";
import { getMyDashboard } from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/me", requireAuth, profileReadLimiter, asyncHandler(getMyDashboard));

export default router;