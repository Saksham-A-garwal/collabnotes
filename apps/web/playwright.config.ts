import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev --workspace=apps/api",
      cwd: "../..",
      url: "http://localhost:4000/health",
      reuseExistingServer: !!process.env.PW_REUSE,
      timeout: 120_000,
      env: {
        SNAPSHOT_INTERVAL_MS: "2000",
        AUTH_RATE_LIMIT_MAX: "1000",
        EMAIL_TRANSPORT: "outbox",
        OTP_RESEND_COOLDOWN_SECONDS: "0",
        EMAIL_DAILY_LIMIT: "1000000",
        SEARCH_INDEX_DEBOUNCE_MS: "300",
      },
    },
    {
      command: "npm run dev --workspace=apps/web",
      cwd: "../..",
      url: "http://localhost:5173",
      reuseExistingServer: !!process.env.PW_REUSE,
      timeout: 120_000,
    },
  ],
});
