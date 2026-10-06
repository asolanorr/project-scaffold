/**
 * What an object store has to offer the upload flow. Supabase Storage in
 * production, a fake in tests; swapping providers is a new file under
 * ./providers and one line in ./index.
 */
export type SignedUpload = {
  /** Where the browser PUTs the bytes. */
  url: string;
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>;
  /** When the URL stops working. */
  expiresAt: Date;
};

export type ObjectInfo = {
  size: number;
  contentType: string | null;
};

export type StorageProvider = {
  readonly name: string;
  /** Mint a one-shot upload URL for a key that does not exist yet. */
  createSignedUpload(key: string, options: { contentType: string }): Promise<SignedUpload>;
  /** Size and declared type of the object, or null when there is none. */
  head(key: string): Promise<ObjectInfo | null>;
  /** The first `bytes` bytes of the object — enough to identify the format. */
  readHead(key: string, bytes: number): Promise<Uint8Array>;
  /** A short-lived URL to read the object. */
  createSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Delete the object; a missing object is not an error. */
  remove(key: string): Promise<void>;
};
