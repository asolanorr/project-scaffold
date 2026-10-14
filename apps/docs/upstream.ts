/**
 * Where the scaffold lives, and which of its sources a derived project may
 * legitimately have deleted. Read by source.config.ts.
 *
 * Kept in its own file because `pnpm run project:init` rewrites the scaffold's
 * name everywhere except here: this URL must keep pointing at the scaffold.
 */
export const UPSTREAM_REPO = "https://github.com/asolanorr/project-scaffold";

/**
 * Sources the example feature owns. `pnpm run project:init` can delete them,
 * and a docs `<include>` of one then renders a note linking to UPSTREAM_REPO
 * instead of failing the build. Every other missing file still fails it: a
 * moved file must break the docs, not leave a stale sample.
 */
export const REMOVABLE_SOURCES = [
  "apps/web/src/features/projects/",
  "apps/web/src/app/[locale]/(app)/projects/",
  "packages/db/src/schema/projects.ts",
  "e2e/projects.spec.ts",
];
