import { requestUploadSchema } from "@repo/db/schema";
import { z } from "zod";

// Input the database does not model: the id an action acts on, and the
// coercion form fields need. Row schemas come from `@repo/db/schema`.
//
// Imported from `@repo/db/schema`, not `@repo/db`: this module is shared with
// client components, and the barrel carries the Postgres client.

/** The id a confirm or delete action receives. */
export const fileIdSchema = z.object({ id: z.uuid() });

/**
 * What the request-upload form sends. `size` arrives through `parseFormData`
 * as a string — `requestUploadSchema` expects the row's native number, so the
 * one field that needs coercion is overridden here; `originalName` and
 * `mimeType` keep the length limits derived from the column.
 */
export const requestUploadFormSchema = requestUploadSchema.extend({
  size: z.coerce.number().int().positive(),
});

/**
 * Form-level failures a file action can report. Keys under `files.errors`.
 *
 *   - mimeTypeNotAllowed / fileTooLarge: the request didn't pass the policy.
 *   - notFound: no pending row for this id and this owner — covers an
 *     unknown id, another user's id, and a row that is already ready or
 *     deleted, identically.
 *   - objectMissing: confirm was called before the browser's PUT finished
 *     (or it never will).
 *   - mimeMismatch: the bytes at the object don't match an allowed type, or
 *     don't match what was declared at request time.
 */
export const FILE_ERROR_KEYS = [
  "mimeTypeNotAllowed",
  "fileTooLarge",
  "notFound",
  "objectMissing",
  "mimeMismatch",
  "unexpected",
] as const;

export type FileErrorCode = (typeof FILE_ERROR_KEYS)[number];
