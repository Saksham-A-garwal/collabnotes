import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../../.env") });

const bool = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
    GOOGLE_REDIRECT_URI: z.string().optional().default(""),
    CORS_ORIGIN: z.string().min(1),
    SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(600000),
    PORT: z.coerce.number().int().positive().default(4000),
    ACCESS_TOKEN_TTL: z.string().min(1).default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    SERVE_WEB: bool("false"),
    REDIS_RELAY: bool("true"),

    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    EMAIL_TRANSPORT: z.enum(["resend", "console", "outbox"]).default("resend"),
    RESEND_API_KEY: z.string().optional().default(""),
    EMAIL_FROM: z.string().min(1).default("CollabNotes <onboarding@resend.dev>"),
    EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(90),
    EMAIL_SIGNIN_RESERVE: z.coerce.number().int().min(0).default(30),
    SEARCH_INDEX_DEBOUNCE_MS: z.coerce.number().int().min(0).default(10_000),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(30),
  })
  .superRefine((e, ctx) => {
    if (e.EMAIL_TRANSPORT === "outbox" && e.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "outbox transport is not allowed in production" });
    }
  });

export const env = envSchema.parse(process.env);
