import { assertTestDatabase } from "./database";

/**
 * Vitest setup file for every project whose tests can reach a database.
 * Throws before a single test runs when the configured database is not a test
 * database, whichever way the URL got there. A variable that is not set is
 * not a database, so there is nothing to refuse.
 */
for (const variable of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const url = process.env[variable];
  if (url) assertTestDatabase(url, variable);
}
