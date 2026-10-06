import { beforeEach, describe, expect, it } from "vitest";
import { createFakeStorage, type FakeStorageProvider } from "../providers/fake";

let storage: FakeStorageProvider;

beforeEach(() => {
  storage = createFakeStorage();
});

describe("createFakeStorage", () => {
  it("round-trips a signed upload through simulateUpload", async () => {
    const key = "user_1/file_1.png";
    const signed = await storage.createSignedUpload(key, { contentType: "image/png" });

    expect(signed.url).toContain(encodeURIComponent(key));
    expect(await storage.head(key)).toBeNull();

    storage.simulateUpload(key, new Uint8Array([1, 2, 3]), "image/png");

    const info = await storage.head(key);
    expect(info).toEqual({ size: 3, contentType: "image/png" });
  });

  it("reads back the head of an object", async () => {
    const key = "user_1/file_1.png";
    storage.simulateUpload(key, new Uint8Array([1, 2, 3, 4, 5]), "image/png");

    expect(await storage.readHead(key, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("removes an object", async () => {
    const key = "user_1/file_1.png";
    storage.simulateUpload(key, new Uint8Array([1]), "image/png");

    await storage.remove(key);

    expect(await storage.head(key)).toBeNull();
  });
});
