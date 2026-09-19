import { defineConfig } from "@playwright/test";

// E2E needs Postgres + Redis up (see README). It starts the API and web dev
// servers itself. SNAPSHOT_INTERVAL_MS is shortened so the version-history
// flow doesn't wait ten minutes for an auto-snapshot; because of that, stop
// any dev servers already on :4000/:5173 first (or set PW_REUSE=1 to reuse
// them — the restore flow then needs their snapshot interval to be short).
//
// PW_CHANNEL=chrome|msedge runs against an installed browser instead of
// Playwright's bundled Chromium (skips the ~150MB `playwright install`).
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
      env: { SNAPSHOT_INTERVAL_MS: "2000", AUTH_RATE_LIMIT_MAX: "1000" },
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
