/**
 * The upload policy: every type the application accepts, the extension its
 * key gets, and the size ceiling. One list, read by the request action (to
 * validate what the client declared), the confirm action (to validate what
 * file-type found in the bytes) and the Storage bucket config in the
 * migration — keep the three in sync when this changes.
 */
export const ALLOWED_UPLOAD_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_UPLOAD_TYPES;

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB — matches the bucket's file_size_limit.

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return value in ALLOWED_UPLOAD_TYPES;
}

export function extensionFor(mimeType: AllowedMimeType): string {
  return ALLOWED_UPLOAD_TYPES[mimeType];
}
