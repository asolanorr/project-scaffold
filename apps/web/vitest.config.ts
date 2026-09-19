import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A test that calls `setupTestTransaction()` from `@repo/db/testing` runs
    // inside a rolled-back transaction; every other test is unaffected and
    // needs no database.
    setupFiles: ["@repo/db/testing/setup"],
    // @repo/env validates at import, and feature tests import @repo/auth for
    // the real ownership helpers. Placeholders for what the tests never use;
    // DATABASE_URL is deliberately absent — it comes from .env locally and
    // from the job environment in CI.
    env: {
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
