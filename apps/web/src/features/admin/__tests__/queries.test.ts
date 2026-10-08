import { auditLog, db, users } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
vi.mock("@repo/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/auth")>()),
  requireAdmin: () => requireAdminMock(),
  getRequestInfo: () => Promise.resolve({ ipAddress: "203.0.113.7", userAgent: "Mozilla/5.0" }),
}));

vi.mock("server-only", () => ({}));

const { getUserForAdmin, listUsersForAdmin } = await import("../queries");

setupTestTransaction();

const ADMIN = { id: "u_admin", name: "Admin", email: "admin@example.test", role: "admin" as const };
const TARGET = { id: "u_target", name: "Target", email: "target@example.test" };

beforeEach(async () => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({ session: { id: "s_admin" }, user: ADMIN });
  await db.insert(users).values([ADMIN, TARGET]);
});

describe("getUserForAdmin", () => {
  it("returns the user's record", async () => {
    const result = await getUserForAdmin(TARGET.id);

    expect(result).toMatchObject({ id: TARGET.id, name: TARGET.name, email: TARGET.email });
  });

  // Required case: an admin viewing a user's record leaves a trace.
  it("writes an audit row for the admin who viewed it", async () => {
    await getUserForAdmin(TARGET.id);

    const [row] = await db.select().from(auditLog).where(eq(auditLog.entityId, TARGET.id));
    expect(row).toMatchObject({
      actorId: ADMIN.id,
      action: "admin.user.viewed",
      entityType: "user",
      ipAddress: "203.0.113.7",
    });
  });

  // Deliberately not cached — a second view by the same admin must leave
  // its own trace, not reuse the first one's.
  it("writes a fresh audit row on every call", async () => {
    await getUserForAdmin(TARGET.id);
    await getUserForAdmin(TARGET.id);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, TARGET.id));
    expect(rows).toHaveLength(2);
  });

  it("returns null for an unknown id, writing no audit row", async () => {
    const result = await getUserForAdmin("does-not-exist");

    expect(result).toBeNull();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("listUsersForAdmin", () => {
  it("returns every user", async () => {
    const result = await listUsersForAdmin();

    expect(result.map((u) => u.id).sort()).toEqual([ADMIN.id, TARGET.id].sort());
  });

  it("writes an audit row for the listing, with no single entity id", async () => {
    await listUsersForAdmin();

    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, "admin.users.listed"));
    expect(row).toMatchObject({ actorId: ADMIN.id, entityId: null });
  });
});
