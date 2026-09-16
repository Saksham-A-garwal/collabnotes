import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use(healthRouter);

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/documents", documentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
