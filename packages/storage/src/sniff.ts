import { fileTypeFromBuffer } from "file-type";
import { type AllowedMimeType, isAllowedMimeType } from "./policy";

/**
 * How many leading bytes to read before sniffing. file-type's own docs
 * recommend at least this many for reliable detection across formats; our
 * allowlist (PNG/JPEG/WEBP/GIF/PDF) needs far less, but reading a little more
 * than strictly necessary costs nothing and leaves room to widen the
 * allowlist later without revisiting every caller.
 */
export const RECOMMENDED_SNIFF_BYTES = 4100;

/**
 * What the bytes actually are, read from their magic numbers rather than
 * trusted from a declared Content-Type. A browser's `file.type` (and so the
 * value the request action validated) is whatever the OS or the client
 * claims — renaming `payload.html` to `photo.png` changes nothing about the
 * bytes. This is the second, independent check the confirm action runs
 * before a pending upload is allowed to go `ready`.
 */
export async function sniffMimeType(bytes: Uint8Array): Promise<AllowedMimeType | null> {
  const result = await fileTypeFromBuffer(bytes);
  if (!result || !isAllowedMimeType(result.mime)) return null;
  return result.mime;
}
