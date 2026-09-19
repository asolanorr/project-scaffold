import { defineConfig } from "drizzle-kit";

// Not @repo/env here: `drizzle-kit generate` diffs the schema against the
// migrations folder and never opens a connection, so it must work with no
// database reachable at all. Only `migrate` / `push` / `studio` need
// DIRECT_URL to actually be set.
export default defineConfig({
  out: "./migrations",
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
});
