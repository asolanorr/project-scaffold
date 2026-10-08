import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces "append-only" the only way a Postgres-level constraint cannot:
 * `audit_log` has no RLS and no trigger, so the guarantee is that nothing in
 * the repo's own source ever calls `.update(auditLog)` or `.delete(auditLog)`
 * — the sole writer is `appendAuditLog()` in `../audit.ts`, which only ever
 * inserts.
 *
 * A best-effort regex scan, not a type system: it would miss a mutation
 * reached through a renamed import (`import { auditLog as x }`) or a
 * dynamically-built table reference. It would not miss the straightforward
 * mistake — writing an admin "undo" or "redact" feature that calls
 * `db.update(auditLog)` — which is the mistake this exists to catch.
 *
 * Test files are excluded: a test may legitimately insert fixture rows
 * directly, and the pattern this file searches for would otherwise match its
 * own source.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const MUTATION_PATTERN = /\.(update|delete)\s*\(\s*auditLog\s*[,)]/;

/** Every package and app's own `src`, discovered rather than hardcoded so a
 * workspace added later is covered without remembering to list it here. */
function listScanRoots(): string[] {
  const roots: string[] = [];
  for (const group of ["apps", "packages"]) {
    let names: string[];
    try {
      names = readdirSync(join(REPO_ROOT, group));
    } catch {
      continue;
    }
    for (const name of names) {
      const src = join(REPO_ROOT, group, name, "src");
      if (statSync(src, { throwIfNoEntry: false })?.isDirectory()) roots.push(src);
    }
  }
  return roots;
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next" || entry === "dist")
      continue;

    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("audit_log is append-only", () => {
  it("has no update or delete call against it anywhere in the application source", () => {
    const offenders: string[] = [];

    for (const dir of listScanRoots()) {
      for (const file of listSourceFiles(dir)) {
        const content = readFileSync(file, "utf-8");
        if (MUTATION_PATTERN.test(content)) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
