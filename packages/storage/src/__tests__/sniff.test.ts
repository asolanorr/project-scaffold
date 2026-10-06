import { describe, expect, it } from "vitest";
import { sniffMimeType } from "../sniff";

// Minimal, valid magic-number prefixes for each allowed type. file-type reads
// only the header, so these short buffers are enough to identify the format
// without a full, valid file body.
//
// PNG needs more than its 8-byte signature: the detector walks chunks and
// only confirms the format once it sees a 13-byte IHDR chunk followed by an
// IDAT chunk header, so the fixture builds both from named parts.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR_CHUNK = [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...Array(13).fill(0), 0, 0, 0, 0];
const PNG_IDAT_CHUNK_HEADER = [0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54];
const PNG_HEADER = new Uint8Array([...PNG_SIGNATURE, ...PNG_IHDR_CHUNK, ...PNG_IDAT_CHUNK_HEADER]);

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0x4a, 0x46, 0x49, 0x46]);
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0]);
const PDF_HEADER = new TextEncoder().encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");

describe("sniffMimeType", () => {
  it("identifies a PNG from its magic bytes", async () => {
    expect(await sniffMimeType(PNG_HEADER)).toBe("image/png");
  });

  it("identifies a JPEG from its magic bytes", async () => {
    expect(await sniffMimeType(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("identifies a GIF from its magic bytes", async () => {
    expect(await sniffMimeType(GIF_HEADER)).toBe("image/gif");
  });

  it("identifies a PDF from its magic bytes", async () => {
    expect(await sniffMimeType(PDF_HEADER)).toBe("application/pdf");
  });

  it("returns null for bytes that are not a recognised format", async () => {
    expect(await sniffMimeType(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  // The whole point: a declared Content-Type is not evidence. A script
  // renamed to look like an image must not pass as one.
  it("returns null for a type outside the allowlist, even a real one", async () => {
    const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
    expect(await sniffMimeType(htmlBytes)).toBeNull();
  });

  it("returns null for an empty buffer", async () => {
    expect(await sniffMimeType(new Uint8Array())).toBeNull();
  });
});
