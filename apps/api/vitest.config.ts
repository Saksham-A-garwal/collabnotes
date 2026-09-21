import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Sign-in emails go to an in-memory outbox, never the network.
    env: { EMAIL_TRANSPORT: "outbox", OTP_RESEND_COOLDOWN_SECONDS: "0", NODE_ENV: "test", AUTH_RATE_LIMIT_MAX: "1000", EMAIL_DAILY_LIMIT: "1000000" },
    // The realtime/sharing suites drive real sockets, Postgres and Redis;
    // 5s default is tight on a cold machine (e.g. right after Docker starts).
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
