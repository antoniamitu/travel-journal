// backend/src/app.js
import express from "express";
import helmet from "helmet";
import { corsMiddleware } from "./config/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.set("strict routing", false);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );

  app.use(corsMiddleware());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}