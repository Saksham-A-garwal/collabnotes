import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The realtime/sharing suites drive real sockets, Postgres and Redis;
    // 5s default is tight on a cold machine (e.g. right after Docker starts).
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
