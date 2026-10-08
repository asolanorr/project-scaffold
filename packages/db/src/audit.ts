import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "./client";
import type * as schema from "./schema";
import { type AuditDiff, auditLog } from "./schema/audit-log";

type Database = PostgresJsDatabase<typeof schema>;

export type AppendAuditLogEntry = {
  /** Null for an action with no known account — a failed sign-in attempt. */
  actorId: string | null;
  action: string;
  entityType: string;
  /** Null when there is no specific record to point at (a failed sign-in;
   * a list view that is not about any one entity). */
  entityId: string | null;
  /** Null for a read or any action with nothing to diff. */
  diff?: AuditDiff | null;
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * The only way a row enters `audit_log`. No update, no delete, exported from
 * here or anywhere else — see `src/__tests__/audit-log-append-only.test.ts`.
 *
 * Pass the transaction you are already in (`db.transaction(async (tx) =>
 * ...)`) so the audit row lands in the same commit as the change it
 * describes, or omit it for a read with nothing else to make atomic.
 */
export async function appendAuditLog(entry: AppendAuditLogEntry, tx: Database = db): Promise<void> {
  await tx.insert(auditLog).values(entry);
}

/**
 * The field-level diff an audit row's `diff` column expects: `{old, new}`
 * for every key in `after` whose value actually differs from `before`.
 * Comparison is by JSON equality, which is exact for the primitives, strings
 * and dates an admin form edits and avoids a dependency for anything deeper.
 *
 * A key present in `after` with the same value as `before` is left out —
 * the diff is what changed, not what was merely touched.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): AuditDiff {
  const diff: AuditDiff = {};
  for (const key of Object.keys(after)) {
    if (!(key in after)) continue;
    const beforeValue = before[key as keyof T];
    const afterValue = after[key as keyof T];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      diff[key] = { old: beforeValue, new: afterValue };
    }
  }
  return diff;
}
