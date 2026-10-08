import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appendAuditLog, diffFields } from "../audit";
import { db } from "../client";
import { auditLog, users } from "../schema";
import { setupTestTransaction } from "../testing";

setupTestTransaction();

describe("diffFields", () => {
  it("includes only fields that actually changed", () => {
    expect(
      diffFields({ name: "Old Name", role: "user" }, { name: "New Name", role: "user" }),
    ).toEqual({ name: { old: "Old Name", new: "New Name" } });
  });

  it("is empty when nothing in the update differs from the current value", () => {
    expect(diffFields({ name: "Same" }, { name: "Same" })).toEqual({});
  });

  it("diffs every changed field, not just the first", () => {
    expect(diffFields({ name: "Old", role: "user" }, { name: "New", role: "admin" })).toEqual({
      name: { old: "Old", new: "New" },
      role: { old: "user", new: "admin" },
    });
  });
});

describe("appendAuditLog", () => {
  it("writes a row with the given fields", async () => {
    const [user] = await db
      .insert(users)
      .values({ id: "u_actor", name: "Actor", email: "actor@example.test" })
      .returning();
    if (!user) throw new Error("fixture insert returned no row");

    await appendAuditLog({
      actorId: user.id,
      action: "admin.user.viewed",
      entityType: "user",
      entityId: user.id,
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });

    const [row] = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
    expect(row).toMatchObject({
      actorId: user.id,
      action: "admin.user.viewed",
      entityType: "user",
      entityId: user.id,
      diff: null,
      ipAddress: "203.0.113.7",
    });
  });

  it("writes a diff when one is given", async () => {
    await appendAuditLog({
      actorId: null,
      action: "admin.user.updated",
      entityType: "user",
      entityId: "u_target",
      diff: { name: { old: "Old", new: "New" } },
      ipAddress: null,
      userAgent: null,
    });

    const [row] = await db.select().from(auditLog).where(eq(auditLog.entityId, "u_target"));
    expect(row?.diff).toEqual({ name: { old: "Old", new: "New" } });
  });

  it("writes inside a given transaction rather than opening its own", async () => {
    await db.transaction(async (tx) => {
      await appendAuditLog(
        {
          actorId: null,
          action: "test.tx",
          entityType: "test",
          entityId: null,
          ipAddress: null,
          userAgent: null,
        },
        tx,
      );
    });

    const [row] = await db.select().from(auditLog).where(eq(auditLog.action, "test.tx"));
    expect(row).toBeDefined();
  });
});
