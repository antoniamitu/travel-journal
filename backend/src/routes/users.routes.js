// backend/src/routes/users.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { profileReadLimiter } from "../middleware/profileReadLimiter.js";
import {
  deleteProfile,
  getProfile,
  getUserProfileByUsername,
  searchAccounts
} from "../controllers/users.controller.js";

const router = Router();

router.get("/profile", requireAuth, profileReadLimiter, asyncHandler(getProfile));
router.delete("/profile", requireAuth, asyncHandler(deleteProfile));

// IMPORTANT:
// Static routes like "/search" MUST stay before dynamic routes like "/:username".
router.get("/search", requireAuth, profileReadLimiter, asyncHandler(searchAccounts));

router.get("/:username", requireAuth, profileReadLimiter, asyncHandler(getUserProfileByUsername));

export default router;