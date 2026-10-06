import { env } from "@repo/env";
import type { StorageProvider } from "./provider";
import { createSupabaseStorage } from "./providers/supabase";

export {
  ALLOWED_UPLOAD_TYPES,
  type AllowedMimeType,
  extensionFor,
  isAllowedMimeType,
  MAX_UPLOAD_SIZE_BYTES,
} from "./policy";
export type { ObjectInfo, SignedUpload, StorageProvider } from "./provider";
export { RECOMMENDED_SNIFF_BYTES, sniffMimeType } from "./sniff";

/** Where uploaded objects live. Matches the bucket created in the migration. */
export const UPLOADS_BUCKET = "uploads";

let provider: StorageProvider | undefined;

/** Replace the provider. Tests install a fake; nothing else should call this. */
export function setStorageProvider(next: StorageProvider | undefined): StorageProvider | undefined {
  const previous = provider;
  provider = next;
  return previous;
}

function defaultProvider(): StorageProvider {
  // Optional in the schema (local dev and CI run without Supabase Storage,
  // see @repo/storage/testing), so the clear failure lives here instead of a
  // crash at import time — only an attempt to actually store a file fails,
  // and it fails with a message that names what to set.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Storage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "Set both, or call setStorageProvider() with a provider (tests use " +
        "createFakeStorage() from @repo/storage/testing).",
    );
  }
  return createSupabaseStorage({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: UPLOADS_BUCKET,
  });
}

/** The active storage provider. */
export function storage(): StorageProvider {
  provider ??= defaultProvider();
  return provider;
}

/**
 * The object key for a file: `{ownerId}/{fileId}{ext}`. Never the client's
 * filename — a path segment under someone's control is a traversal or a
 * collision waiting to happen, and the original name is kept only as
 * display data in the database row.
 */
export function objectKeyFor(ownerId: string, fileId: string, extension: string): string {
  return `${ownerId}/${fileId}${extension}`;
}
