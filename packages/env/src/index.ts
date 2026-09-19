import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Load the repository-root .env, if there is one.
 *
 * One .env at the root, shared by the app, drizzle-kit, the tests and the
 * scripts. Each of those runs with a different working directory, so the
 * candidates walk up from wherever the process started.
 *
 * Deliberately written with no imports. This module is pulled into the edge
 * middleware bundle, where `node:fs` would not resolve; `process.loadEnvFile`
 * simply does not exist there, so the guard makes the whole thing a no-op.
 *
 * Values already in the environment win — `loadEnvFile` does not overwrite
 * them — so a deployment's real variables are never shadowed by a stray file,
 * and in a deployment there is no file to find in the first place.
 */
function loadRootEnvFile(): void {
  const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof load !== "function") return;

  for (const candidate of [".env", "../.env", "../../.env"]) {
    try {
      load.call(process, candidate);
      return;
    } catch {
      // Not here. Keep walking up.
    }
  }
}

loadRootEnvFile();

// Single source of truth for environment variables. Every package and app
// that needs one imports it from here instead of reading `process.env`
// directly — @repo/db, @repo/auth and apps/web all add their own required
// keys to these two schemas as those pieces are built.
export const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  server: {
    // Pooled connection (Supabase port 6543, transaction mode) — used by the
    // application at runtime. See ARCHITECTURE.md §4, "On Supabase specifically".
    DATABASE_URL: z.url(),
    // Direct connection (port 5432) — used by drizzle-kit for migrations only.
    DIRECT_URL: z.url(),

    // Signing key for session tokens and every other Better Auth secret. 32
    // bytes minimum because it is the input to the HMAC — generate one with
    // `openssl rand -base64 32`. Rotating it invalidates every live session.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public origin the app is served from. Better Auth builds callback URLs
    // from it and validates the request origin against it, so a wrong value
    // fails closed rather than silently allowing a cross-origin sign-in.
    BETTER_AUTH_URL: z.url(),

    // CSP_REPORT_ONLY is deliberately not here — it is read by the middleware,
    // which runs on the edge and must not import this schema. See ./edge.
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
