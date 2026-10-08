import "server-only";

import { env } from "@repo/env";
import * as Sentry from "@sentry/nextjs";

/**
 * Not the full `@sentry/nextjs` setup — no `instrumentation.ts`, no
 * `withSentryConfig` in next.config, no client-side init. Those cover the
 * rest of the app (error.tsx, request tracing) and are a separate,
 * still-outstanding piece of this scaffold (see ARCHITECTURE.md's "Error
 * reporting"). This is only enough for a cron job to report its own
 * failures, which is deliberately self-contained: `Sentry.init()` here, lazily,
 * the first time a job actually fails.
 */
let initialized = false;

function ensureInitialized(): void {
  if (initialized || !env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0 });
  initialized = true;
}

/**
 * Report a job's failure. A no-op when `SENTRY_DSN` is unset — local
 * development and CI run with no DSN, and the job's own console.error is
 * what shows up there; this only adds the alert.
 */
export function captureJobFailure(job: string, error: unknown): void {
  ensureInitialized();
  Sentry.captureException(error, { tags: { job } });
}
