import "@repo/env/load";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The database tests run against when none is configured. */
export const DEFAULT_TEST_DATABASE = "scaffold_test";

// Arbitrary, but fixed: every process that ensures the test database takes the
// same session lock, so `turbo run test` starting several packages at once
// creates and migrates it once rather than racing itself.
const ENSURE_LOCK_ID = 7_283_001;

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

function withDatabase(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

/**
 * Refuse any database whose name does not end in `_test`.
 *
 * Tests roll back what they write, but several assert on whole tables, and a
 * stray `DATABASE_URL` is one export away from pointing them at real data. The
 * name is the cheapest signal that exists on every Postgres, so it is the
 * contract: a test database says so in its name. The password is never echoed.
 */
export function assertTestDatabase(url: string, variable = "DATABASE_URL"): void {
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    const { hostname, port } = new URL(url);
    throw new Error(
      [
        `Refusing to run tests: ${variable} points at database "${name}" on ${hostname}:${port || "5432"}.`,
        `A test database's name must end in "_test" (the default is "${DEFAULT_TEST_DATABASE}").`,
        "Unset TEST_DATABASE_URL to use the default, or point it at a database made for tests.",
      ].join("\n"),
    );
  }
}

/**
 * The URLs the tests use. TEST_DATABASE_URL wins for both. Otherwise each of
 * DATABASE_URL and DIRECT_URL keeps its host and port but swaps in the test
 * database name — unless it already ends in `_test`, which is how CI's service
 * container is named, so CI needs nothing extra.
 */
export function resolveTestUrls(env: NodeJS.ProcessEnv = process.env): {
  databaseUrl: string;
  directUrl: string;
} {
  const explicit = env.TEST_DATABASE_URL;
  if (explicit) return { databaseUrl: explicit, directUrl: explicit };

  const derive = (url: string | undefined, variable: string): string => {
    if (!url) throw new Error(`${variable} is not set. Copy .env.example to .env — see README.md.`);
    return databaseName(url).endsWith("_test") ? url : withDatabase(url, DEFAULT_TEST_DATABASE);
  };
  return {
    databaseUrl: derive(env.DATABASE_URL, "DATABASE_URL"),
    directUrl: derive(env.DIRECT_URL, "DIRECT_URL"),
  };
}

/**
 * Create the test database if it is missing and apply every migration to it.
 * Safe to call from several processes at once and cheap when nothing is
 * pending, so a test run needs no setup step of its own.
 */
export async function ensureTestDatabase(directUrl: string): Promise<{ created: boolean }> {
  assertTestDatabase(directUrl, "the test database URL");
  const name = databaseName(directUrl);
  // Created through the server's maintenance database, which always exists.
  const admin = postgres(withDatabase(directUrl, "postgres"), { max: 1, connect_timeout: 5 });
  let created = false;

  try {
    await admin`select pg_advisory_lock(${ENSURE_LOCK_ID})`;
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      await admin.unsafe(`create database "${name.replaceAll('"', '""')}"`);
      created = true;
    }

    const client = postgres(directUrl, { max: 1, connect_timeout: 5 });
    try {
      await migrate(drizzle(client), {
        migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
      });
    } finally {
      await client.end({ timeout: 5 });
    }
  } finally {
    await admin`select pg_advisory_unlock(${ENSURE_LOCK_ID})`.catch(() => undefined);
    await admin.end({ timeout: 5 });
  }
  return { created };
}
