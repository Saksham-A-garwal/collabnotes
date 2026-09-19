import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env regardless of which directory the process was
// started from (npm workspace scripts run with cwd = apps/api).
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../../.env") });

const envSchema = z.object({
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
  // Per-IP auth requests per 15 minutes (SRS §9.2 A07). E2E raises this: it
  // registers a dozen users from one address.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export const env = envSchema.parse(process.env);
