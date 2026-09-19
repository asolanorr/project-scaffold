import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // @repo/env validates at import. Nothing here reaches a database or
    // Resend; the fake transport is what the tests assert against.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:6543/test",
      DIRECT_URL: "postgres://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
