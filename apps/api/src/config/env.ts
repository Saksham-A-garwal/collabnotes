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
  CORS_ORIGIN: z.string().min(1),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(600000),
  PORT: z.coerce.number().int().positive().default(4000),
});

export const env = envSchema.parse(process.env);
