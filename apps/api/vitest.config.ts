import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { EMAIL_TRANSPORT: "outbox", OTP_RESEND_COOLDOWN_SECONDS: "0", NODE_ENV: "test", AUTH_RATE_LIMIT_MAX: "1000", EMAIL_DAILY_LIMIT: "1000000", SEARCH_INDEX_DEBOUNCE_MS: "150" },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
