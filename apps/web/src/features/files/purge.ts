import "server-only";

import { db, files } from "@repo/db";
import { storage } from "@repo/storage";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";

/**
 * How long a pending row may sit with no confirmed upload before it is
 * abandoned. Long enough for a slow connection to finish a 10 MiB upload;
 * short enough that a browser tab closed mid-upload does not leave a
 * reserved object key and a row around indefinitely.
 */
export const PENDING_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

/**
 * Soft-delete pending rows whose upload window has passed, and best-effort
 * remove whatever object may exist at their key.
 *
 * Intended for a scheduled job; there is no scheduler in the scaffold yet
 * (see the "Add a background job" recipe), so today this is called by hand
 * or from a deploy step. Written the same way
 * `purgeExpiredAuthEvents` is in `packages/auth`: a plain function with no
 * knowledge of what calls it, so the test drives it directly.
 */
export async function purgeStalePendingFiles(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_WINDOW_MS);

  const stale = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.status, "pending"), isNull(files.deletedAt), lt(files.createdAt, cutoff)));

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
