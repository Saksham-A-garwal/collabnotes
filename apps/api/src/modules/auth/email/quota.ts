import { env } from "../../../config/env.js";
import { redisPub } from "../../../lib/redis.js";

export type EmailKind = "signin" | "invite" | "mention";

const dayKey = (): string => `email:daily:${new Date().toISOString().slice(0, 10)}`;

export async function takeDailySlot(kind: EmailKind): Promise<boolean> {
  const ceiling = kind === "signin" ? env.EMAIL_DAILY_LIMIT : Math.max(0, env.EMAIL_DAILY_LIMIT - env.EMAIL_SIGNIN_RESERVE);
  const key = dayKey();
  try {
    const count = await redisPub.incr(key);
    if (count === 1) await redisPub.expire(key, 2 * 24 * 60 * 60);
    if (count > ceiling) {
      await redisPub.decr(key);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", message: "daily email budget unavailable", kind, error: (err as Error).message }));
    return kind === "signin";
  }
}

export async function withinWindow(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const count = await redisPub.incr(key);
    if (count === 1) await redisPub.expire(key, windowSeconds);
    return count <= max;
  } catch {
    return false;
  }
}

export async function claimCooldown(key: string, seconds: number): Promise<boolean> {
  try {
    return (await redisPub.set(key, "1", "EX", seconds, "NX")) === "OK";
  } catch {
    return false;
  }
}
