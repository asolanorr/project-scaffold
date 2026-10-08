import "server-only";

import { getRequestInfo, requireAdmin } from "@repo/auth";
import { type AdminUserView, adminUserColumns, appendAuditLog, db, users } from "@repo/db";
import { desc, eq } from "drizzle-orm";

/**
 * Every user, for the admin list. Deliberately not `"use cache"` — see
 * `getUserForAdmin`.
 */
export async function listUsersForAdmin(): Promise<AdminUserView[]> {
  const session = await requireAdmin();

  const rows = await db.select(adminUserColumns).from(users).orderBy(desc(users.createdAt));

  const { ipAddress, userAgent } = await getRequestInfo();
  await appendAuditLog({
    actorId: session.user.id,
    action: "admin.users.listed",
    entityType: "user",
    entityId: null,
    ipAddress,
    userAgent,
  });

  return rows;
}

/**
 * One user's record, for the admin detail view.
 *
 * Deliberately not `"use cache"`: a cache hit would mean a second admin
 * viewing the same record inside the cache's lifetime leaves no trace,
 * which is exactly the gap "every admin read of personal data writes an
 * audit row" must not have. The cost is a query on every view; the admin
 * section is not meant to be the hot path a cache tag exists to protect.
 */
export async function getUserForAdmin(userId: string): Promise<AdminUserView | null> {
  const session = await requireAdmin();

  const [user] = await db.select(adminUserColumns).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const { ipAddress, userAgent } = await getRequestInfo();
  await appendAuditLog({
    actorId: session.user.id,
    action: "admin.user.viewed",
    entityType: "user",
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  return user;
}
