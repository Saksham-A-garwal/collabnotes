import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env regardless of which directory the process was
// started from (npm workspace scripts run with cwd = apps/api).
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
    // Serve the built frontend (apps/web/dist) from this process, with SPA
    // fallback — a single-service deployment: same origin, no CORS.
    SERVE_WEB: bool("false"),
    // Cross-instance Redis relay (Architecture §6.3). Only useful with more than
    // one API instance; set to "false" for a single instance to stop publishing
    // every edit and cursor move to Redis (which also spends hosted-Redis
    // command quotas). Rate limiting still uses Redis either way.
    REDIS_RELAY: bool("true"),

    // How many reverse proxies sit in front of this process. Express only
    // believes X-Forwarded-For entries added by *that many* hops from the right,
    // so a client can't invent its own IP to dodge per-IP rate limits. 0 = no
    // proxy (local dev, direct connections).
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Per-IP requests per 15 minutes for "send me a code". E2E raises this: it
    // signs in a dozen users from one address.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    // --- Email sign-in (Resend) ---
    // "resend": real delivery. "console": print to the server log (local dev).
    // "outbox": keep in memory and expose to the E2E suite — refused in production.
    EMAIL_TRANSPORT: z.enum(["resend", "console", "outbox"]).default("resend"),
    RESEND_API_KEY: z.string().optional().default(""),
    // Until a domain is verified in Resend, only onboarding@resend.dev works,
    // and it can only deliver to the Resend account owner's own address.
    EMAIL_FROM: z.string().min(1).default("CollabNotes <onboarding@resend.dev>"),
    // Hard cap on emails sent per UTC day, across everyone — protects the
    // provider quota (Resend's free tier is 100/day) from being drained by abuse.
    EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(90),
    // Slots at the top of that daily budget that only sign-in codes may use.
    // Invitation emails stop this many short of the cap, so a burst of invites
    // can never leave someone unable to log in.
    EMAIL_SIGNIN_RESERVE: z.coerce.number().int().min(0).default(30),
    // Minimum gap between codes for one address.
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(30),
  })
  .superRefine((e, ctx) => {
    // The outbox exposes sent codes over HTTP for tests. That must be
    // impossible to switch on in production, however the env is misconfigured.
    if (e.EMAIL_TRANSPORT === "outbox" && e.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "outbox transport is not allowed in production" });
    }
  });

export const env = envSchema.parse(process.env);
