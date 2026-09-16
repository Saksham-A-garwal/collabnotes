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
    // Fail fast rather than letting a ping queue behind ioredis's offline
    // queue and retry backoff (which could take tens of seconds) if Redis
    // is genuinely unreachable, not just still connecting.
    if (redisPub.status !== "ready") throw new Error("Redis not connected");
    await redisPub.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const ok = checks.postgres && checks.redis;
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks });
});
