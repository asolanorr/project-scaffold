import { db, files } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { MAX_UPLOAD_SIZE_BYTES } from "@repo/storage";
import {
  createFakeStorage,
  type FakeStorageProvider,
  setStorageProvider,
} from "@repo/storage/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheTags } from "@/lib/cache-tags";
import { form, OTHER, OWNER, RedirectError, seedUsers, sessionFor } from "@/test/fixtures";

// Only the session is replaced. `ownedBy` and the rest of @repo/auth are
// real — the predicate under test is the one the application ships.
const requireSessionMock = vi.fn();
vi.mock("@repo/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/auth")>()),
  requireSession: () => requireSessionMock(),
}));

const updateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  updateTag: (tag: string) => updateTagMock(tag),
}));

vi.mock("server-only", () => ({}));

const { confirmFileUpload, requestFileUpload } = await import("../actions");

setupTestTransaction();

const initial = { ok: false } as const;

const signedInAs = (user: typeof OWNER) => requireSessionMock.mockResolvedValue(sessionFor(user));
const signedOut = () =>
  requireSessionMock.mockImplementation(() => {
    throw new RedirectError("/sign-in");
  });

let storage: FakeStorageProvider;

beforeEach(async () => {
  vi.clearAllMocks();
  storage = createFakeStorage();
  setStorageProvider(storage);
  await seedUsers();
});

afterEach(() => {
  setStorageProvider(undefined);
});

// A real, minimal PNG: file-type's PNG detector walks chunks and only
// confirms the format once it sees a 13-byte IHDR followed by an IDAT chunk
// header — the same fixture packages/storage's own tests use.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR_CHUNK = [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...Array(13).fill(0), 0, 0, 0, 0];
const PNG_IDAT_CHUNK_HEADER = [0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54];
const PNG_BYTES = new Uint8Array([...PNG_SIGNATURE, ...PNG_IHDR_CHUNK, ...PNG_IDAT_CHUNK_HEADER]);

async function requestUpload(overrides: Partial<Record<string, string>> = {}) {
  signedInAs(OWNER);
  const result = await requestFileUpload(
    initial,
    form({
      originalName: "photo.png",
      mimeType: "image/png",
      size: String(PNG_BYTES.length),
      ...overrides,
    }),
  );
  if (!result.ok) throw new Error(`fixture request-upload failed: ${JSON.stringify(result)}`);
  return result.data;
}

describe("requestFileUpload", () => {
  it("redirects an unauthenticated request before touching the database", async () => {
    signedOut();

    await expect(
      requestFileUpload(initial, form({ originalName: "a.png", mimeType: "image/png", size: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(await db.select().from(files)).toHaveLength(0);
  });

  it("returns field errors as message keys on invalid input", async () => {
    signedInAs(OWNER);

    // An empty string reads as absent (parseFormData), so a missing name is
    // "required" rather than "tooShort" — there is no non-empty string short
    // enough to trip the column's min(1) separately from that.
    const result = await requestFileUpload(
      initial,
      form({ originalName: "", mimeType: "image/png", size: "10" }),
    );

    expect(result).toEqual({ ok: false, errors: { originalName: ["required"] } });
  });

  // Required case: a declared type outside the allowlist is rejected before
  // any row or signed URL exists.
  it("rejects a declared mime type outside the allowlist", async () => {
    signedInAs(OWNER);

    const result = await requestFileUpload(
      initial,
      form({ originalName: "script.sh", mimeType: "application/x-sh", size: "10" }),
    );

    expect(result).toEqual({ ok: false, code: "mimeTypeNotAllowed" });
    expect(await db.select().from(files)).toHaveLength(0);
    expect(storage.signedUploads.size).toBe(0);
  });

  // Required case: a declared size over the ceiling is rejected the same way.
  it("rejects a file larger than the size ceiling", async () => {
    signedInAs(OWNER);

    const result = await requestFileUpload(
      initial,
      form({
        originalName: "huge.png",
        mimeType: "image/png",
        size: String(MAX_UPLOAD_SIZE_BYTES + 1),
      }),
    );

    expect(result).toEqual({ ok: false, code: "fileTooLarge" });
    expect(await db.select().from(files)).toHaveLength(0);
  });

  it("accepts a file exactly at the size ceiling", async () => {
    const ticket = await requestUpload({ size: String(MAX_UPLOAD_SIZE_BYTES) });

    expect(ticket.fileId).toBeTruthy();
  });

  it("creates a pending row keyed by {ownerId}/{fileId}{ext}, never the client's filename", async () => {
    const ticket = await requestUpload({ originalName: "../../etc/passwd.png" });

    const [row] = await db.select().from(files).where(eq(files.id, ticket.fileId));
    expect(row?.status).toBe("pending");
    expect(row?.ownerId).toBe(OWNER.id);
    expect(row?.originalName).toBe("../../etc/passwd.png");
    expect(row?.storageKey).toBe(`${OWNER.id}/${ticket.fileId}.png`);
    expect(row?.storageKey).not.toContain("etc/passwd");
  });

  it("returns a signed upload URL and invalidates the file list", async () => {
    const ticket = await requestUpload();

    expect(ticket.uploadUrl).toContain(encodeURIComponent(`${OWNER.id}/${ticket.fileId}.png`));
    expect(ticket.uploadHeaders["content-type"]).toBe("image/png");
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.files(OWNER.id));
  });
});

describe("confirmFileUpload", () => {
  it("redirects an unauthenticated request", async () => {
    const ticket = await requestUpload();
    signedOut();

    await expect(confirmFileUpload(initial, form({ id: ticket.fileId }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("answers not-found for an id that is not a uuid", async () => {
    signedInAs(OWNER);

    expect(await confirmFileUpload(initial, form({ id: "not-a-uuid" }))).toEqual({
      ok: false,
      code: "notFound",
    });
  });

  // Required case: another user's (real) file id is refused identically to
  // an unknown one — never a 403 that would confirm the id exists.
  it("answers not-found for another user's file id", async () => {
    const ticket = await requestUpload();
    storage.simulateUpload(`${OWNER.id}/${ticket.fileId}.png`, PNG_BYTES, "image/png");
    updateTagMock.mockClear();
    signedInAs(OTHER);

    const result = await confirmFileUpload(initial, form({ id: ticket.fileId }));

    expect(result).toEqual({ ok: false, code: "notFound" });
    const [row] = await db.select().from(files).where(eq(files.id, ticket.fileId));
    expect(row?.status).toBe("pending");
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("answers objectMissing when the browser never finished the PUT", async () => {
    const ticket = await requestUpload();
    signedInAs(OWNER);

    const result = await confirmFileUpload(initial, form({ id: ticket.fileId }));

    expect(result).toEqual({ ok: false, code: "objectMissing" });
    const [row] = await db.select().from(files).where(eq(files.id, ticket.fileId));
    expect(row?.status).toBe("pending");
  });

  it("re-checks the mime type from the bytes and refuses a mismatch", async () => {
    const ticket = await requestUpload({ mimeType: "image/png", originalName: "photo.png" });
    const key = `${OWNER.id}/${ticket.fileId}.png`;
    // Declared image/png; the bytes are actually a JPEG.
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0x4a, 0x46, 0x49, 0x46]);
    storage.simulateUpload(key, jpegBytes, "image/png");
    signedInAs(OWNER);

    const result = await confirmFileUpload(initial, form({ id: ticket.fileId }));

    expect(result).toEqual({ ok: false, code: "mimeMismatch" });
    // The row and the object are both cleaned up — a mismatch is treated as
    // the upload having failed, not as something to leave pending forever.
    const [row] = await db.select().from(files).where(eq(files.id, ticket.fileId));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await storage.head(key)).toBeNull();
  });

  it("refuses bytes that are not a recognised format at all", async () => {
    const ticket = await requestUpload();
    const key = `${OWNER.id}/${ticket.fileId}.png`;
    storage.simulateUpload(key, new Uint8Array([1, 2, 3, 4, 5]), "image/png");
    signedInAs(OWNER);

    expect(await confirmFileUpload(initial, form({ id: ticket.fileId }))).toEqual({
      ok: false,
      code: "mimeMismatch",
    });
  });

  it("confirms a matching upload: flips to ready, uses the real size, invalidates tags", async () => {
    const ticket = await requestUpload();
    const key = `${OWNER.id}/${ticket.fileId}.png`;
    storage.simulateUpload(key, PNG_BYTES, "image/png");
    signedInAs(OWNER);

    const result = await confirmFileUpload(initial, form({ id: ticket.fileId }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      id: ticket.fileId,
      originalName: "photo.png",
      mimeType: "image/png",
      status: "ready",
      size: PNG_BYTES.length,
    });
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.files(OWNER.id));
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.file(ticket.fileId));
  });

  it("confirming twice answers not-found the second time", async () => {
    const ticket = await requestUpload();
    const key = `${OWNER.id}/${ticket.fileId}.png`;
    storage.simulateUpload(key, PNG_BYTES, "image/png");
    signedInAs(OWNER);
    await confirmFileUpload(initial, form({ id: ticket.fileId }));

    const result = await confirmFileUpload(initial, form({ id: ticket.fileId }));

    expect(result).toEqual({ ok: false, code: "notFound" });
  });
});
