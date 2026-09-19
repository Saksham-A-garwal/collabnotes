import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only — Playwright's *.spec.ts files live in e2e/ and run
    // under `npm run e2e`, not vitest.
    include: ["src/**/*.test.ts"],
  },
});
