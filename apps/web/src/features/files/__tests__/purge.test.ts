import { db, files } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import {
  createFakeStorage,
  type FakeStorageProvider,
  setStorageProvider,
} from "@repo/storage/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER, seedUsers } from "../../projects/__tests__/fixtures";

vi.mock("server-only", () => ({}));

const { PENDING_UPLOAD_WINDOW_MS, purgeStalePendingFiles } = await import("../purge");

setupTestTransaction();

let storage: FakeStorageProvider;

beforeEach(async () => {
  storage = createFakeStorage();
  setStorageProvider(storage);
  await seedUsers();
});

afterEach(() => {
  setStorageProvider(undefined);
});

async function insertPending(overrides: Partial<typeof files.$inferInsert> = {}) {
  const [row] = await db
    .insert(files)
    .values({
      ownerId: OWNER.id,
      storageKey: `${OWNER.id}/${crypto.randomUUID()}.png`,
      originalName: "photo.png",
      mimeType: "image/png",
      size: 10,
      status: "pending",
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("fixture insert returned no row");
  return row;
}

describe("purgeStalePendingFiles", () => {
  // The required case: a row from a request-upload whose browser PUT never
  // happened (and never will) is eventually cleaned up rather than sitting
  // in the table, and taking its reserved storage key with it, forever.
  it("soft-deletes a pending row whose upload window has passed", async () => {
    const old = await insertPending({
      createdAt: new Date(Date.now() - PENDING_UPLOAD_WINDOW_MS - 60_000),
    });

    const purged = await purgeStalePendingFiles();

    expect(purged).toBe(1);
    const [row] = await db.select().from(files).where(eq(files.id, old.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("leaves a pending row that is still inside the upload window alone", async () => {
    const fresh = await insertPending({ createdAt: new Date() });

    const purged = await purgeStalePendingFiles();

    expect(purged).toBe(0);
    const [row] = await db.select().from(files).where(eq(files.id, fresh.id));
    expect(row?.deletedAt).toBeNull();
  });

  it("never touches a row that already reached ready", async () => {
    const ready = await insertPending({
      status: "ready",
      createdAt: new Date(Date.now() - PENDING_UPLOAD_WINDOW_MS - 60_000),
    });

    await purgeStalePendingFiles();

    const [row] = await db.select().from(files).where(eq(files.id, ready.id));
    expect(row?.deletedAt).toBeNull();
  });

  it("removes an object left behind by an interrupted upload", async () => {
    const old = await insertPending({
      createdAt: new Date(Date.now() - PENDING_UPLOAD_WINDOW_MS - 60_000),
    });
    storage.simulateUpload(old.storageKey, new Uint8Array([1, 2, 3]), "image/png");

    await purgeStalePendingFiles();

    expect(await storage.head(old.storageKey)).toBeNull();
  });

  it("purges a row whose object was never uploaded at all without failing", async () => {
    const old = await insertPending({
      createdAt: new Date(Date.now() - PENDING_UPLOAD_WINDOW_MS - 60_000),
    });

    await expect(purgeStalePendingFiles()).resolves.toBe(1);
    const [row] = await db.select().from(files).where(eq(files.id, old.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
