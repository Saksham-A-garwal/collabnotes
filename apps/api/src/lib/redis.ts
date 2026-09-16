import { Redis } from "ioredis";
import { env } from "../config/env.js";

// Separate connections per Redis client-mode restriction: a connection in
// subscribe mode can't also issue regular commands (Architecture §6.3).
export const redisPub = new Redis(env.REDIS_URL, { lazyConnect: true });
export const redisSub = new Redis(env.REDIS_URL, { lazyConnect: true });
