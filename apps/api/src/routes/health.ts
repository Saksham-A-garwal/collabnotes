import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisPub } from "../lib/redis.js";

export const healthRouter = Router();

// GET /health — verifies Postgres and Redis connectivity (Architecture §10).
healthRouter.get("/health", async (_req, res) => {
  const checks = { postgres: false, redis: false };

  try {
    await pool.query("SELECT 1");
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  try {
    if (redisPub.status !== "ready") await redisPub.connect();
    await redisPub.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const ok = checks.postgres && checks.redis;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks });
});
