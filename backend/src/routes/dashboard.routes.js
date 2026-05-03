// backend/src/routes/dashboard.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getMyDashboard } from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/me", requireAuth, asyncHandler(getMyDashboard));

export default router;