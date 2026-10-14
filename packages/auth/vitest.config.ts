import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Nothing here connects, but the package imports @repo/db: the guard keeps
    // it that way if a real URL ever replaces the placeholders below.
    setupFiles: ["@repo/db/testing/guard"],
    // Importing @repo/db pulls in the client, and @repo/env validates at
    // import time. These are placeholders, not a test database: postgres-js
    // connects lazily, and every test here mocks the db before it would.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:6543/scaffold_test",
      DIRECT_URL: "postgres://test:test@localhost:5432/scaffold_test",
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      CRON_SECRET: "test-secret-at-least-sixteen-characters",
    },
  },
});
