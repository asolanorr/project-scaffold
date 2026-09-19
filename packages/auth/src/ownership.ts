import { db } from "@repo/db";
import { and, eq, type InferColumnsDataTypes, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";

/**
 * A table a user can own.
 *
 * `deletedAt` is required, not optional. Every ownable table in this codebase
 * is soft-deletable, and requiring the column here means a table that forgets
 * it fails to compile rather than quietly letting deleted rows back into reads.
 */
export type OwnableTable = PgTable & {
  id: PgColumn;
  ownerId: PgColumn;
  deletedAt: PgColumn;
};

/**
 * The ownership predicate, as a `WHERE` clause.
 *
 * Ownership belongs in the query, never in an `if` after it. A scoped query
 * cannot be forgotten the way a follow-up check can, it returns nothing rather
 * than something to leak, and it cannot race a concurrent write between the
 * read and the check.
 */
//#region ownedBy
export function ownedBy(table: OwnableTable, id: string, ownerId: string): SQL {
  // `and()` returns undefined only for an empty argument list; three fixed
  // conditions cannot produce that.
  return and(eq(table.id, id), eq(table.ownerId, ownerId), isNull(table.deletedAt)) as SQL;
}
//#endregion

/**
 * Fetch a row the caller owns, or stop the request with a 404.
 *
 * 404 and not 403, deliberately: "forbidden" confirms to an attacker that the
 * id exists and belongs to someone else, which is a free enumeration oracle
 * over every id they care to try. A missing row and someone else's row look
 * identical from outside.
 *
 * `columns` has no default. Selecting the whole row by default would mean a
 * column added to the table later is disclosed by every caller that already
 * exists.
 */
export async function requireOwned<TColumns extends Record<string, PgColumn>>(args: {
  table: OwnableTable;
  columns: TColumns;
  id: string;
  ownerId: string;
}): Promise<InferColumnsDataTypes<TColumns>> {
  // Drizzle's builder types collapse when the table is a generic `PgTable`
  // instead of a literal table object — the awaited result widens to `any[]`,
  // and `.limit()` leaves it a union TypeScript will not destructure. The
  // column selection is still precisely typed, so the row shape is derived
  // from `columns` and asserted once here rather than letting `any` reach
  // callers.
  const rows = (await db
    .select(args.columns)
    .from(args.table)
    .where(ownedBy(args.table, args.id, args.ownerId))
    .limit(1)) as InferColumnsDataTypes<TColumns>[];

  const row = rows[0];
  // notFound() throws, like redirect(). Do not catch it.
  if (!row) notFound();
  return row;
}
