import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { devOutboxRouter } from "./modules/dev/outbox.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { shareRedeemRouter } from "./modules/sharing/sharing.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "20kb" }));

  app.use(healthRouter);

  app.use("/api/v1/auth", authRouter);
  if (env.EMAIL_TRANSPORT === "outbox") app.use("/api/v1/dev", devOutboxRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/share", shareRedeemRouter);
  app.use("/api/v1/notifications", notificationsRouter);

  const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (env.SERVE_WEB && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/") || req.path === "/health") {
        next();
        return;
      }
      res.sendFile("index.html", { root: webDist });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
