import type { NextFunction, Request, Response } from "express";
import { redisPub } from "../lib/redis.js";

// Ported from the Cortex project's rateLimit.middleware.js: a Redis
// INCR+EXPIRE fixed-window counter per key, fail-open on Redis errors so an
// outage degrades to "unlimited" rather than locking everyone out (SRS §9.2
// A07 just asks for rate-limited auth endpoints, not five-nines on the
// limiter itself).
function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

type RateLimitOptions = {
  keyPrefix: string;
  windowSeconds: number;
  max: number;
  keyBy?: "ip" | ((req: Request) => string);
  message?: string;
};

async function incrementCounter(key: string, windowSeconds: number): Promise<number> {
  if (redisPub.status !== "ready") await redisPub.connect();
  const count = await redisPub.incr(key);
  if (count === 1) await redisPub.expire(key, windowSeconds);
  return count;
}

export function rateLimit({
  keyPrefix,
  windowSeconds,
  max,
  keyBy = "ip",
  message = "Too many requests. Please slow down and try again shortly.",
}: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = typeof keyBy === "function" ? keyBy(req) : clientIp(req);
    const key = `ratelimit:${keyPrefix}:${identity}`;

    try {
      const count = await incrementCounter(key, windowSeconds);

      if (count > max) {
        const ttl = await redisPub.ttl(key);
        const retryAfter = ttl >= 0 ? ttl : windowSeconds;
        res.set("Retry-After", String(retryAfter));
        const minutes = Math.max(1, Math.ceil(retryAfter / 60));
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: `${message} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          },
        });
        return;
      }

      next();
    } catch (err) {
      console.error(JSON.stringify({ level: "warn", message: `rate limit unavailable for ${keyPrefix}`, error: (err as Error).message }));
      next();
    }
  };
}
