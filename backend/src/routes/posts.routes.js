// backend/src/routes/posts.routes.js
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireJsonBody } from "../utils/requireJsonBody.js";
import { postsReadLimiter } from "../middleware/postsReadLimiter.js";
import { create, getById, remove, update } from "../controllers/posts.controller.js";

const router = Router();

router.get(
  "/ping",
  asyncHandler(async (req, res) => {
    res.status(200).json({ ok: true, scope: "posts" });
  })
);

// Step 2.1
router.post("/", requireAuth, requireJsonBody, asyncHandler(create));

// Step 2.4
router.put("/:id", requireAuth, requireJsonBody, asyncHandler(update));

// IMPORTANT:
// Future static GET routes like "/locations/suggest" MUST be declared before "/:id"
// so they are not captured by the dynamic id route.

// Step 2.2
router.get("/:id", requireAuth, postsReadLimiter, asyncHandler(getById));

// Step 2.3
router.delete("/:id", requireAuth, asyncHandler(remove));

export default router;