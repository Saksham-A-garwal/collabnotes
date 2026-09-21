import { env } from "../../../config/env.js";
import { redisPub } from "../../../lib/redis.js";

// Resend's free tier allows ~100 emails a day, and every message the app sends
// — sign-in codes and invitations alike — draws on that one budget. It is
// counted here, across everybody, so abuse can't drain it.
//
// The two kinds are not equal: a sign-in code is what lets a person in at all,
// while an invitation or a mention alert is a courtesy. So those stop EMAIL_SIGNIN_RESERVE
// short of the cap, keeping that headroom for codes.
export type EmailKind = "signin" | "invite" | "mention";

const dayKey = (): string => `email:daily:${new Date().toISOString().slice(0, 10)}`;

export async function takeDailySlot(kind: EmailKind): Promise<boolean> {
  const ceiling = kind === "signin" ? env.EMAIL_DAILY_LIMIT : Math.max(0, env.EMAIL_DAILY_LIMIT - env.EMAIL_SIGNIN_RESERVE);
  const key = dayKey();
  try {
    const count = await redisPub.incr(key);
    if (count === 1) await redisPub.expire(key, 2 * 24 * 60 * 60);
    if (count > ceiling) {
      // A refused send must not use up budget.
      await redisPub.decr(key);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", message: "daily email budget unavailable", kind, error: (err as Error).message }));
    // Sign-in fails open (a Redis blip mustn't lock people out; the provider
    // enforces its own ceiling). Invitations fail closed: they're optional, and
    // sending unmetered mail is the riskier way to be wrong.
    return kind === "signin";
  }
}

// Fixed-window counter: true while the caller is still within `max` in `windowSeconds`.
// Fails closed — used only to protect optional email.
export async function withinWindow(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const count = await redisPub.incr(key);
    if (count === 1) await redisPub.expire(key, windowSeconds);
    return count <= max;
  } catch {
    return false;
  }
}

// True only for the first caller within `seconds` — a cooldown.
export async function claimCooldown(key: string, seconds: number): Promise<boolean> {
  try {
    return (await redisPub.set(key, "1", "EX", seconds, "NX")) === "OK";
  } catch {
    return false;
  }
}
