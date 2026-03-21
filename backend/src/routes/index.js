// backend/src/routes/index.js
import { Router } from "express";

import authRoutes from "./auth.routes.js";
import geocodeRoutes from "./geocode.routes.js";
import uploadsRoutes from "./uploads.routes.js";
import postsRoutes from "./posts.routes.js";
import mapRoutes from "./map.routes.js";
import aiRoutes from "./ai.routes.js";
import usersRoutes from "./users.routes.js";

const router = Router();

router.get("/ping", (req, res) => {
  res.status(200).json({ ok: true, scope: "api" });
});

router.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/geocode", geocodeRoutes);
router.use("/uploads", uploadsRoutes);
router.use("/posts", postsRoutes);
router.use("/map", mapRoutes);
router.use("/ai", aiRoutes);

export default router;