import { z } from "zod";

// Trim + lowercase before the format check (ported from Cortex's common.schema.js).
// The length cap is the RFC 5321 maximum; without it the value is an unbounded
// string that ends up in the database, the rate-limit keys and outgoing email.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Must be a valid email address.")
  .pipe(z.string().email("Must be a valid email address."));

// People paste "123 456" or "123-456"; strip separators before checking.
const code = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code."));

const displayName = z.string().trim().min(1, "Enter your name.").max(80);

export const requestCodeSchema = z.object({ email });
export const verifyCodeSchema = z.object({ email, code });
// Either field may be sent alone; sending neither is a mistake worth reporting.
export const updateMeSchema = z
  .object({ displayName: displayName.optional(), emailMentions: z.boolean().optional() })
  .refine((v) => v.displayName !== undefined || v.emailMentions !== undefined, "Nothing to update.");
export const oauthGoogleSchema = z.object({ code: z.string().min(1).max(2048) });
export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(256) });
