import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach } from "vitest";
import { state, type Transaction } from "./state";

/**
 * Run every test in this file inside a database transaction that is rolled
 * back afterwards.
 *
 * Tests share one database — the one at DATABASE_URL, with migrations applied —
 * without sharing state: whatever a test inserts is gone before the next one
 * starts, with no truncation step and no per-test schema. Code under test does
 * not change; it keeps importing `db` from `@repo/db`, and the setup file
 * points that at the open transaction.
 *
 * Requires `@repo/db/testing/setup` in the project's vitest `setupFiles`.
 *
 * Without a reachable database the tests are skipped locally, with a warning,
 * and fail in CI — a machine without Postgres should not report green, and a
 * pipeline without Postgres is misconfigured.
 */
export function setupTestTransaction(): () => Transaction {
  let release: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  let unavailable: string | undefined;

  beforeEach(async (context) => {
    const real = state.real;
    if (!real) {
      throw new Error(
        "setupTestTransaction() needs `@repo/db/testing/setup` in this project's vitest setupFiles.",
      );
    }

    if (unavailable) {
      context.skip(unavailable);
    }

    let settle: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });

    try {
      state.tx = await new Promise<Transaction>((resolve, reject) => {
        // The callback holds the transaction open until `settle()` runs in
        // afterEach, then throws so Drizzle issues ROLLBACK instead of COMMIT.
        pending = real
          .transaction(async (tx) => {
            resolve(tx);
            await finished;
            throw new RollbackSignal();
          })
          .catch((error: unknown) => {
            if (error instanceof RollbackSignal) return;
            // Connection refused, missing table, and the like: surface it
            // where the test is, not as an unhandled rejection later.
            reject(error);
          });
      });
    } catch (error) {
      const reason = describeFailure(error);
      if (process.env.CI) {
        throw new Error(`${reason} CI provides one; check the job's service container.`, {
          cause: error,
        });
      }
      unavailable = `${reason} Start one, run \`pnpm db:migrate\`, and rerun.`;
      console.warn(`\nDatabase tests skipped. ${unavailable}\n`);
      context.skip(unavailable);
    }

    release = settle;
  });

  afterEach(async () => {
    state.tx = undefined;
    release?.();
    release = undefined;
    await pending;
    pending = undefined;
  });

  afterAll(async () => {
    // Each test file gets its own module instance and so its own client;
    // close it so the worker is not kept alive by an idle socket.
    await state.real?.$client.end({ timeout: 5 });
  });

  return () => {
    if (!state.tx) {
      throw new Error(
        "No test transaction is open. Call the getter inside a test, not at module level.",
      );
    }
    return state.tx;
  };
}

class RollbackSignal extends Error {
  override readonly name = "RollbackSignal";
}

function describeFailure(error: unknown): string {
  // postgres-js reports a refused connection with an empty message and the
  // reason in `code` (ECONNREFUSED), so both are read.
  const detail =
    error instanceof Error
      ? [error.message, (error as { code?: string }).code].filter(Boolean).join(" ")
      : String(error);
  return `Could not use Postgres at DATABASE_URL${detail ? ` (${detail})` : ""}.`;
}

/** True when the connection works and the migrations are applied. */
export async function isMigrated(tx: Transaction): Promise<boolean> {
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return (rows[0]?.count ?? 0) > 0;
}
