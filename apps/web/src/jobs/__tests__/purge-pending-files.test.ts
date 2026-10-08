import { db, files } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { env } from "@repo/env";
import { createFakeStorage, setStorageProvider } from "@repo/storage/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER, seedUsers } from "@/test/fixtures";
import { PENDING_UPLOAD_WINDOW_MS } from "../../features/files/purge";

vi.mock("server-only", () => ({}));

const { GET } = await import("../purge-pending-files");

setupTestTransaction();

beforeEach(async () => {
  setStorageProvider(createFakeStorage());
  await seedUsers();
});

afterEach(() => {
  setStorageProvider(undefined);
});

const authHeader = { authorization: `Bearer ${env.CRON_SECRET}` };

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/jobs/purge-pending-files", { headers });
}

async function insertPending(createdAt: Date) {
  const [row] = await db
    .insert(files)
    .values({
      ownerId: OWNER.id,
      storageKey: `${OWNER.id}/${crypto.randomUUID()}.png`,
      originalName: "photo.png",
      mimeType: "image/png",
      size: 10,
      status: "pending",
      createdAt,
    })
    .returning();
  if (!row) throw new Error("fixture insert returned no row");
  return row;
}

describe("GET /api/jobs/purge-pending-files", () => {
  it("answers 401 for an unauthenticated call", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it("soft-deletes pending files past the upload window", async () => {
    const stale = await insertPending(new Date(Date.now() - PENDING_UPLOAD_WINDOW_MS - 60_000));

    const response = await GET(request(authHeader));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 1 });
    const [row] = await db.select().from(files).where(eq(files.id, stale.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
