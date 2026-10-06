/** Postgres error codes this app branches on, by name instead of a bare string. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle wraps the driver error in a DrizzleQueryError; the Postgres code is
 * on the cause. Checked on both, so a driver that does not wrap still works.
 *
 * A unique violation is the one database failure a user can cause and fix —
 * a duplicate name, a retried webhook event. It becomes a code or a no-op,
 * and the error itself never leaves. Anything else is a bug and should be
 * rethrown for the error boundary and Sentry, never swallowed here.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION ||
    (error as { cause?: { code?: unknown } } | null)?.cause?.code === UNIQUE_VIOLATION
  );
}
