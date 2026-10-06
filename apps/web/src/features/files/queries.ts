import "server-only";

import { db, type FileView, fileColumns, files } from "@repo/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";

/**
 * Reads for the files feature. Pure functions of their arguments — the user
 * id is a parameter, never the session — and scoped by owner inside the
 * `WHERE` clause. Only `ready` files are visible here: a pending row is not
 * yet confirmed, and showing it would let a user reference bytes nobody has
 * checked.
 */

/** A user's ready files, newest first. */
export async function listFiles(userId: string): Promise<FileView[]> {
  "use cache";
  cacheTag(cacheTags.files(userId));

  return db
    .select(fileColumns)
    .from(files)
    .where(and(eq(files.ownerId, userId), eq(files.status, "ready"), isNull(files.deletedAt)))
    .orderBy(desc(files.createdAt), desc(files.id));
}

/** One ready file the user owns, or null — a missing, pending, someone
 * else's, or deleted file all look the same from outside. */
export async function getFile(userId: string, fileId: string): Promise<FileView | null> {
  "use cache";
  cacheTag(cacheTags.file(fileId), cacheTags.files(userId));

  const [file] = await db
    .select(fileColumns)
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        eq(files.status, "ready"),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);

  return file ?? null;
}
