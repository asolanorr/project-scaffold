import "server-only";

import { db, files } from "@repo/db";
import { storage } from "@repo/storage";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";

/**
 * How long a pending row may sit with no confirmed upload before it is
 * abandoned. Long enough for a slow connection on a flaky network to finish
 * and come back to confirm; short enough that a browser tab closed mid-upload
 * does not leave a reserved object key and a row around indefinitely.
 */
export const PENDING_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How many rows one call removes at most. A backlog larger than this is
 * cleared over several ticks of the schedule in `apps/web/src/jobs`, not in
 * one call that risks the function timeout.
 */
export const DEFAULT_PURGE_BATCH_SIZE = 500;

/**
 * Soft-delete pending rows whose upload window has passed, and best-effort
 * remove whatever object may exist at their key. Scheduled from
 * `apps/web/src/jobs/purge-pending-files.ts`. Idempotent: once every stale
 * row is soft-deleted, a second call finds none and removes nothing.
 */
//#region purge
export async function purgeStalePendingFiles(
  now: Date = new Date(),
  limit: number = DEFAULT_PURGE_BATCH_SIZE,
): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_WINDOW_MS);

  const stale = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.status, "pending"), isNull(files.deletedAt), lt(files.createdAt, cutoff)))
    .limit(limit);

  if (stale.length === 0) return 0;

  for (const row of stale) {
    // A browser that never started the PUT leaves no object at all; one that
    // was interrupted mid-upload may. Either way the row is being removed,
    // so a failed or no-op removal here must not block that.
    await storage()
      .remove(row.storageKey)
      .catch((error: unknown) => {
        console.error(`[files] could not remove orphaned object ${row.storageKey}`, error);
      });
  }

  await db
    .update(files)
    .set({ deletedAt: now })
    .where(
      inArray(
        files.id,
        stale.map((row) => row.id),
      ),
    );

  return stale.length;
}
//#endregion
