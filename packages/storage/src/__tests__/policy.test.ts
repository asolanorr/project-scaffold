import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_TYPES,
  extensionFor,
  isAllowedMimeType,
  MAX_UPLOAD_SIZE_BYTES,
} from "../policy";

describe("isAllowedMimeType", () => {
  it("accepts every type in the allowlist", () => {
    for (const mime of Object.keys(ALLOWED_UPLOAD_TYPES)) {
      expect(isAllowedMimeType(mime)).toBe(true);
    }
  });

  it("rejects a type outside the allowlist", () => {
    expect(isAllowedMimeType("application/x-sh")).toBe(false);
    expect(isAllowedMimeType("text/html")).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps every allowed type to an extension starting with a dot", () => {
    for (const mime of Object.keys(ALLOWED_UPLOAD_TYPES) as (keyof typeof ALLOWED_UPLOAD_TYPES)[]) {
      expect(extensionFor(mime)).toMatch(/^\.\w+$/);
    }
  });
});

describe("MAX_UPLOAD_SIZE_BYTES", () => {
  it("is 10 MiB, matching the bucket's file_size_limit", () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
