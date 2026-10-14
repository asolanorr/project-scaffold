import { assertTestDatabase, ensureTestDatabase, resolveTestUrls } from "./database";

/**
 * Vitest `globalSetup`: point the run at the test database and make sure it
 * exists and is migrated, so `pnpm test` works from a clean machine.
 *
 * Setting `process.env` here is what the workers inherit, so every test file
 * — and the guard in `./guard` — sees the test URLs, never the dev ones.
 *
 * With no Postgres reachable it only warns locally, so pure tests still run and
 * database tests skip as they always have; in CI it fails.
 */
export default async function globalSetup(): Promise<void> {
  const { databaseUrl, directUrl } = resolveTestUrls();
  assertTestDatabase(databaseUrl, "DATABASE_URL");
  assertTestDatabase(directUrl, "DIRECT_URL");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;

  try {
    await ensureTestDatabase(directUrl);
  } catch (error) {
    if (process.env.CI) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`\nCould not prepare the test database; database tests will skip. ${reason}\n`);
  }
}
