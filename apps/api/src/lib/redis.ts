import { Redis } from "ioredis";
import { env } from "../config/env.js";

// Separate connections per Redis client-mode restriction: a connection in
// subscribe mode can't also issue regular commands (Architecture §6.3).
//
// No lazyConnect: each client starts connecting immediately at import time
// and ioredis's default offline queue holds any commands issued before
// it's ready, flushing them once connected. The previous lazyConnect +
// manual `if (status !== "ready") await client.connect()` pattern at every
// call site was a real race — two concurrent callers could both see
// "not ready" and both call .connect(), and ioredis throws on the second
// one ("Redis is already connecting/connected"). Letting ioredis own its
// own connection lifecycle removes the race entirely instead of guarding
// against it.
export const redisPub = new Redis(env.REDIS_URL);
export const redisSub = new Redis(env.REDIS_URL);
