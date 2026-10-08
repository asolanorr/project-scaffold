import { auditLog, db, users } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form } from "../../projects/__tests__/fixtures";

const requireAdminMock = vi.fn();
vi.mock("@repo/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/auth")>()),
  requireAdmin: () => requireAdminMock(),
  getRequestInfo: () => Promise.resolve({ ipAddress: "203.0.113.7", userAgent: "Mozilla/5.0" }),
}));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

vi.mock("server-only", () => ({}));

const { updateUserAsAdmin } = await import("../actions");

setupTestTransaction();

const initial = { ok: false } as const;

const ADMIN = { id: "u_admin", name: "Admin", email: "admin@example.test", role: "admin" as const };
const TARGET = {
  id: "u_target",
  name: "Old Name",
  email: "target@example.test",
  role: "user" as const,
};

const signedInAsAdmin = () =>
  requireAdminMock.mockResolvedValue({ session: { id: "s_admin" }, user: ADMIN });
// A non-admin and a revoked admin reach `updateUserAsAdmin` identically: the
// role check lives entirely in `requireAdmin()`, which this test treats as a
// black box that either resolves or throws — see packages/auth's own tests
// for the two cases that lead here.
const rejectedAsNonAdmin = () =>
  requireAdminMock.mockImplementation(() => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  });

beforeEach(async () => {
  vi.clearAllMocks();
  await db.insert(users).values([ADMIN, TARGET]);
});

describe("updateUserAsAdmin", () => {
  // Required case: a non-admin (and identically, a revoked admin) is
  // rejected before the database is touched.
  it("404s for a non-admin and changes nothing", async () => {
    rejectedAsNonAdmin();

    await expect(
      updateUserAsAdmin(initial, form({ id: TARGET.id, name: "New Name" })),
    ).rejects.toBeInstanceOf(NotFoundError);

    const [row] = await db.select().from(users).where(eq(users.id, TARGET.id));
    expect(row?.name).toBe("Old Name");
  });

  // Required case: an admin acting on another user's record. There is no
  // ownership check here at all — only the role check above — which is the
  // point of this action existing.
  it("updates another user's record and records who did it", async () => {
    signedInAsAdmin();

    const result = await updateUserAsAdmin(
      initial,
      form({ id: TARGET.id, name: "New Name", role: "admin" }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { id: TARGET.id, name: "New Name", role: "admin" },
    });
    const [row] = await db.select().from(users).where(eq(users.id, TARGET.id));
    expect(row).toMatchObject({ name: "New Name", role: "admin" });
  });

  // Required case: the diff on an update actually shows what changed.
  it("records a diff with only the fields that changed", async () => {
    signedInAsAdmin();

    await updateUserAsAdmin(initial, form({ id: TARGET.id, name: "New Name", role: "user" }));

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, TARGET.id));
    expect(entry).toMatchObject({
      actorId: ADMIN.id,
      action: "admin.user.updated",
      entityType: "user",
    });
    expect(entry?.diff).toEqual({ name: { old: "Old Name", new: "New Name" } });
  });

  it("records no diff when nothing actually changed", async () => {
    signedInAsAdmin();

    await updateUserAsAdmin(initial, form({ id: TARGET.id, name: TARGET.name, role: TARGET.role }));

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, TARGET.id));
    expect(entry?.diff).toBeNull();
  });

  it("answers not-found for an unknown id", async () => {
    signedInAsAdmin();

    const result = await updateUserAsAdmin(
      initial,
      form({ id: "does-not-exist", name: "Whoever" }),
    );

    expect(result).toEqual({ ok: false, code: "notFound" });
  });
});
