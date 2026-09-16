import { z } from "zod";

// Validation rules ported in spirit from Cortex's common.schema.js `email`
// helper (trim + lowercase before format check), values per SRS §7.
const email = z.string().trim().toLowerCase().pipe(z.string().email("Must be a valid email address."));

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Za-z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one digit.");

const displayName = z.string().trim().min(1).max(80);

export const registerSchema = z.object({ email, password, displayName });
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const oauthGoogleSchema = z.object({ code: z.string().min(1) });
export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
