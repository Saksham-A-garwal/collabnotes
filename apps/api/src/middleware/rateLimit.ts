import type { NextFunction, Request, Response } from "express";
import { redisPub } from "../lib/redis.js";

function clientIp(req: Request): string {
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
