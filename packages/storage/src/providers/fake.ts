import type { ObjectInfo, SignedUpload, StorageProvider } from "../provider";

export type FakeObject = { bytes: Uint8Array; contentType: string };

export type FakeStorageProvider = StorageProvider & {
  /** What `createSignedUpload` returned for each key, for assertions. */
  readonly signedUploads: Map<string, SignedUpload>;
  /** Simulate the browser's PUT: writes bytes at a key that was signed. */
  simulateUpload(key: string, bytes: Uint8Array, contentType: string): void;
  /** The current objects, keyed by storage key. */
  readonly objects: Map<string, FakeObject>;
};

/**
 * Records everything instead of touching a network. `createSignedUpload`
 * returns a URL that resolves nothing real; tests call `simulateUpload` to
 * stand in for the browser's PUT, then exercise the confirm action exactly
 * as it runs against a real object.
 */
export function createFakeStorage(): FakeStorageProvider {
  const objects = new Map<string, FakeObject>();
  const signedUploads = new Map<string, SignedUpload>();

  return {
    name: "fake",
    signedUploads,
    objects,

    async createSignedUpload(key, { contentType }) {
      const signed: SignedUpload = {
        url: `https://fake.storage.test/upload/${encodeURIComponent(key)}`,
        headers: { "content-type": contentType },
        expiresAt: new Date(Date.now() + 60_000),
      };
      signedUploads.set(key, signed);
      return signed;
    },

    simulateUpload(key, bytes, contentType) {
      objects.set(key, { bytes, contentType });
    },

    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.bytes.length, contentType: object.contentType } : null;
    },

    async readHead(key, bytes) {
      const object = objects.get(key);
      if (!object) throw new Error(`Storage: no object at ${key}`);
      return object.bytes.subarray(0, bytes);
    },

    async createSignedDownloadUrl(key) {
      if (!objects.has(key)) throw new Error(`Storage: no object at ${key}`);
      return `https://fake.storage.test/download/${encodeURIComponent(key)}`;
    },

    async remove(key) {
      objects.delete(key);
    },
  };
}

export type { ObjectInfo };
