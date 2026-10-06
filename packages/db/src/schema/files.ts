import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { users } from "./auth";

/**
 * pending: a row exists and a signed upload URL was issued; the bytes may or
 * may not have arrived. ready: the object exists, its type was checked from
 * the bytes, and the file may be shown. A pending row older than the upload
 * window is abandoned and purged with its object.
 */
export const fileStatus = pgEnum("file_status", ["pending", "ready"]);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Where the bytes live: `{ownerId}/{id}{ext}`. Never the client's name —
    // that is display data, and a path component under someone's control is
    // a traversal or an overwrite waiting to happen.
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    // Declared at request time; replaced by the object's real size on confirm.
    size: bigint("size", { mode: "number" }).notNull(),
    status: fileStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // the list query: a user's ready files, newest first
    index("files_owner_status_idx").on(t.ownerId, t.status, t.createdAt),
    // the purge: pending rows older than the upload window
    index("files_status_created_idx").on(t.status, t.createdAt),
  ],
);

// Allowlist with .pick(). What a client may declare about an upload — the
// name is display data, the type and size are checked against the policy in
// the feature and re-checked against the object on confirm.
export const requestUploadSchema = createInsertSchema(files, {
  originalName: (s) => s.min(1).max(255),
  mimeType: (s) => s.min(1).max(127),
  size: (s) => s.int().positive(),
}).pick({ originalName: true, mimeType: true, size: true });

export const selectFileSchema = createSelectSchema(files);

// The exact shape that may leave the server. Never a raw row: the storage key
// stays inside, and a URL to the bytes is minted per request.
export const fileColumns = {
  id: files.id,
  originalName: files.originalName,
  mimeType: files.mimeType,
  size: files.size,
  status: files.status,
  createdAt: files.createdAt,
} as const;

export type UploadRequest = z.infer<typeof requestUploadSchema>;
export type FileRow = z.infer<typeof selectFileSchema>;
export type FileView = Pick<FileRow, keyof typeof fileColumns>;
