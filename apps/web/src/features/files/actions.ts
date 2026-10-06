"use server";

import { ownedBy, requireSession } from "@repo/auth";
import { db, type FileView, fileColumns, files } from "@repo/db";
import {
  extensionFor,
  isAllowedMimeType,
  MAX_UPLOAD_SIZE_BYTES,
  objectKeyFor,
  RECOMMENDED_SNIFF_BYTES,
  sniffMimeType,
  storage,
} from "@repo/storage";
import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { cacheTags } from "@/lib/cache-tags";
import { parseFormData } from "@/lib/form";
import { messageKeys } from "@/lib/validation";
import { type FileErrorCode, fileIdSchema, requestUploadFormSchema } from "./schema";

/** What the client needs to do the upload: the signed URL and the id to confirm with. */
export type UploadTicket = {
  fileId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
};

export type RequestUploadState = ActionState<UploadTicket, FileErrorCode>;
export type ConfirmUploadState = ActionState<FileView, FileErrorCode>;

//#region requestUpload
export async function requestFileUpload(
  _prev: RequestUploadState,
  formData: FormData,
): Promise<RequestUploadState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate — parseFormData, never Object.fromEntries.
  const parsed = requestUploadFormSchema.safeParse(parseFormData(formData), {
    error: messageKeys,
  });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 3. authorize — the declared type and size against the upload policy.
  // Checked here, before a row or a URL exists, so a rejected request leaves
  // nothing behind to clean up.
  if (!isAllowedMimeType(parsed.data.mimeType)) {
    return { ok: false, code: "mimeTypeNotAllowed" };
  }
  if (parsed.data.size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, code: "fileTooLarge" };
  }

  // 4. execute — the id is minted here, not by the database default, because
  // the object key the signed URL points at has to be known before the row
  // exists: `{ownerId}/{fileId}{ext}`, never the client's filename.
  const fileId = crypto.randomUUID();
  const storageKey = objectKeyFor(session.user.id, fileId, extensionFor(parsed.data.mimeType));

  const [file] = await db
    .insert(files)
    .values({
      id: fileId,
      ownerId: session.user.id,
      storageKey,
      originalName: parsed.data.originalName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    })
    .returning(fileColumns);
  // INSERT … RETURNING always yields the row; its absence is a bug, not a
  // state to report.
  if (!file) throw new Error("insert returned no row");

  const signed = await storage().createSignedUpload(storageKey, {
    contentType: parsed.data.mimeType,
  });

  // 5. invalidate — by tag, never by path
  updateTag(cacheTags.files(session.user.id));

  // 6. respond — the browser PUTs directly to `uploadUrl`; the server never
  // sees the bytes until confirm reads them back to sniff.
  return {
    ok: true,
    data: { fileId: file.id, uploadUrl: signed.url, uploadHeaders: signed.headers },
  };
}
//#endregion

//#region confirmUpload
export async function confirmFileUpload(
  _prev: ConfirmUploadState,
  formData: FormData,
): Promise<ConfirmUploadState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate
  const id = fileIdSchema.safeParse(parseFormData(formData), { error: messageKeys });
  if (!id.success) return { ok: false, code: "notFound" };

  // 3. authorize + fetch — ownership and "still pending" are both in the
  // WHERE clause. A row that is missing, someone else's, already ready, or
  // soft-deleted all come back as nothing, and all look identical from
  // outside: "notFound", never a distinction an attacker could use to probe
  // which ids exist.
  const [pending] = await db
    .select({ id: files.id, storageKey: files.storageKey, mimeType: files.mimeType })
    .from(files)
    .where(and(ownedBy(files, id.data.id, session.user.id), eq(files.status, "pending")))
    .limit(1);
  if (!pending) return { ok: false, code: "notFound" };

  // 4. execute — verify the object exists, then re-check its type from the
  // bytes. The declared Content-Type (validated at request time) is never
  // trusted on its own: it is whatever the browser claimed, and a renamed
  // file changes nothing about what is actually sitting in the bucket.
  const info = await storage().head(pending.storageKey);
  if (!info) return { ok: false, code: "objectMissing" };

  const head = await storage().readHead(pending.storageKey, RECOMMENDED_SNIFF_BYTES);
  const sniffed = await sniffMimeType(head);
  if (!sniffed || sniffed !== pending.mimeType) {
    // The bytes disagree with what was declared, or aren't an allowed type
    // at all. Remove the object and the row rather than leaving a pending
    // upload that can never be confirmed — the client has to start over with
    // a fresh request, which mints a fresh id and key.
    await storage().remove(pending.storageKey);
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, pending.id));
    return { ok: false, code: "mimeMismatch" };
  }

  const [file] = await db
    .update(files)
    .set({ status: "ready", size: info.size, mimeType: sniffed })
    .where(eq(files.id, pending.id))
    .returning(fileColumns);
  if (!file) throw new Error("update returned no row");

  // 5. invalidate
  updateTag(cacheTags.files(session.user.id));
  updateTag(cacheTags.file(file.id));

  // 6. respond
  return { ok: true, data: file };
}
//#endregion
