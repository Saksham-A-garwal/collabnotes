import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Must be a valid email address.")
  .pipe(z.string().email("Must be a valid email address."));

const code = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code."));

const displayName = z.string().trim().min(1, "Enter your name.").max(80);

export const requestCodeSchema = z.object({ email });
export const verifyCodeSchema = z.object({ email, code });
export const updateMeSchema = z
  .object({ displayName: displayName.optional(), emailMentions: z.boolean().optional() })
  .refine((v) => v.displayName !== undefined || v.emailMentions !== undefined, "Nothing to update.");
export const oauthGoogleSchema = z.object({ code: z.string().min(1).max(2048) });
export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(256) });
