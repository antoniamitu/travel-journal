// backend/src/routes/users.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { profileReadLimiter } from "../middleware/profileReadLimiter.js";
import { deleteProfile, getProfile } from "../controllers/users.controller.js";

const router = Router();

router.get("/profile", requireAuth, profileReadLimiter, asyncHandler(getProfile));
router.delete("/profile", requireAuth, asyncHandler(deleteProfile));

// IMPORTANT:
// When Feature 5.1.1 is implemented, static routes like "/search"
// MUST be declared before dynamic routes like "/:username".

export default router;