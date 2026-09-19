import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * The variables edge code may read.
 *
 * Separate from the main export on purpose. That one declares DATABASE_URL and
 * BETTER_AUTH_SECRET as required, and importing it from middleware drags the
 * whole server schema into the edge bundle — so the middleware would refuse to
 * start without a database URL it never uses, and a secret would be one
 * bundling mistake away from a runtime it does not belong in.
 *
 * Everything here has a default, so edge code validates with nothing set.
 * Anything added to this schema must be safe to evaluate in a runtime that has
 * no filesystem and no .env loading.
 */
export const edgeEnv = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  server: {
    // Documented escape hatch for a project that must ship past a stubborn
    // third-party embed. Off by default, and turning it on is a decision that
    // belongs in a pull request: report-only reports violations and blocks
    // nothing. See ARCHITECTURE.md §10.
    CSP_REPORT_ONLY: z.stringbool().default(false),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    CSP_REPORT_ONLY: process.env.CSP_REPORT_ONLY,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
