import { StorageClient } from "@supabase/storage-js";
import type { StorageProvider } from "../provider";

/**
 * The only file in the repository that imports `@supabase/storage-js`, and it
 * runs on the server with the service role key. The browser never holds a
 * Supabase key: it receives a signed URL for one object and PUTs to it.
 *
 * Signed upload URLs are minted by the service role, so the upload itself
 * bypasses Row Level Security; the policies in the migration are the backstop
 * for any client that ever holds a user JWT, not the path this code takes.
 */
export function createSupabaseStorage(options: {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}): StorageProvider {
  const client = new StorageClient(`${options.url.replace(/\/$/, "")}/storage/v1`, {
    apikey: options.serviceRoleKey,
    Authorization: `Bearer ${options.serviceRoleKey}`,
  });
  const bucket = client.from(options.bucket);

  // Supabase signs upload URLs for two hours; the browser is told a little
  // less so a retry at the edge is not attempted against a dead URL.
  const UPLOAD_URL_TTL_MS = 2 * 60 * 60 * 1000 - 60 * 1000;

  return {
    name: "supabase",

    async createSignedUpload(key, { contentType }) {
      const { data, error } = await bucket.createSignedUploadUrl(key);
      if (error || !data)
        throw new Error(`Storage: could not sign upload for ${key}: ${error?.message}`);
      return {
        url: data.signedUrl,
        // What storage-js's own uploadToSignedUrl sends. `x-upsert: false`
        // makes a second PUT to the same key fail rather than overwrite.
        headers: {
          "content-type": contentType,
          "x-upsert": "false",
          "cache-control": "max-age=3600",
        },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_MS),
      };
    },

    async head(key) {
      const { data, error } = await bucket.info(key);
      if (error) {
        if (isNotFound(error)) return null;
        throw new Error(`Storage: could not read ${key}: ${error.message}`);
      }
      return { size: data.size ?? 0, contentType: data.contentType ?? null };
    },

    async readHead(key, bytes) {
      const url = await this.createSignedDownloadUrl(key, 60);
      const response = await fetch(url, { headers: { range: `bytes=0-${bytes - 1}` } });
      if (!response.ok) throw new Error(`Storage: could not read ${key}: HTTP ${response.status}`);
      const buffer = new Uint8Array(await response.arrayBuffer());
      // A server that ignores Range returns the whole object; keep the head.
      return buffer.length > bytes ? buffer.subarray(0, bytes) : buffer;
    },

    async createSignedDownloadUrl(key, expiresInSeconds) {
      const { data, error } = await bucket.createSignedUrl(key, expiresInSeconds);
      if (error || !data)
        throw new Error(`Storage: could not sign download for ${key}: ${error?.message}`);
      return data.signedUrl;
    },

    async remove(key) {
      const { error } = await bucket.remove([key]);
      if (error && !isNotFound(error))
        throw new Error(`Storage: could not remove ${key}: ${error.message}`);
    },
  };
}

function isNotFound(error: { status?: number; statusCode?: string; message: string }): boolean {
  return error.status === 404 || error.statusCode === "404" || /not.?found/i.test(error.message);
}
