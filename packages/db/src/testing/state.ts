import type { db } from "../client";

export type Database = typeof db;
/** The handle Drizzle passes to a `db.transaction()` callback. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Shared between `./setup` (which replaces `db`) and `./index` (which opens
 * the transaction). One module instance per test file, which is exactly the
 * lifetime the transaction has.
 */
export const state: {
  /** The unmocked client, captured by the setup file. */
  real: Database | undefined;
  /** The transaction the current test runs in, if it asked for one. */
  tx: Transaction | undefined;
} = { real: undefined, tx: undefined };
