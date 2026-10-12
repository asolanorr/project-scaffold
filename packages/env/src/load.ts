/**
 * Load the repository-root .env, if there is one. Loads only — never
 * validates, so importing this has no required variables of its own.
 *
 * One .env at the root, shared by the app, the tests and the scripts. Each of
 * those runs with a different working directory, so the candidates walk up
 * from wherever the process started.
 *
 * drizzle.config.ts imports this directly (`@repo/env/load`, not the package
 * root) rather than this package's validated export: `drizzle-kit generate`
 * has to work with no database reachable at all, and the full validated
 * export would make DATABASE_URL a requirement just to generate a migration.
 *
 * Deliberately written with no imports. This module is pulled into the edge
 * middleware bundle, where `node:fs` would not resolve; `process.loadEnvFile`
 * simply does not exist there, so the guard makes the whole thing a no-op.
 *
 * Values already in the environment win — `loadEnvFile` does not overwrite
 * them — so a deployment's real variables are never shadowed by a stray file,
 * and in a deployment there is no file to find in the first place.
 */
export function loadRootEnvFile(): void {
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
