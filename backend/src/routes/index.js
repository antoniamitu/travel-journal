// backend/src/routes/index.js
import { Router } from "express";

import authRoutes from "./auth.routes.js";
import geocodeRoutes from "./geocode.routes.js";

const router = Router();

router.get("/ping", (req, res) => {
  res.status(200).json({ ok: true, scope: "api" });
});

router.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

router.use("/auth", authRoutes);
router.use("/geocode", geocodeRoutes);

export default router;