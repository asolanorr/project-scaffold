import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Points `db` at the per-test transaction. See src/testing.
    setupFiles: ["./src/testing/setup.ts"],
    // @repo/env validates every variable at import time, and this package
    // only uses the database ones. DATABASE_URL is deliberately absent: it
    // comes from .env locally and from the job environment in CI.
    env: {
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      CRON_SECRET: "test-secret-at-least-sixteen-characters",
    },
  },
});
