import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { users } from "./auth";

/**
 * Field-level before/after values, keyed by field name. A row with no
 * changed fields (a read, not a write) carries `null` here, never an empty
 * object standing in for "nothing happened."
 */
export type AuditDiff = Record<string, { old: unknown; new: unknown }>;

/**
 * Every security-relevant and admin action in the app, generalized from what
 * was `auth_events` (sign-in, sign-in failed, password change) into a table
 * that also covers an admin acting on someone else's record. `action` is a
 * free-form string (`"auth.sign_in"`, `"admin.user.viewed"`) rather than a
 * Postgres enum — unlike the narrow, stable set `auth_event_type` used to
 * declare, the set of actions here grows with every admin feature, and an
 * enum would mean a migration for each one.
 *
 * `actorId` is nullable for the same reason it was on `auth_events`: a
 * failed sign-in attempt has no account to point at. Its foreign key is
 * `onDelete: "set null"`, not `cascade` — deleting an account (including an
 * admin's) must not erase the record of what that account did.
 *
 * `entityId` has no foreign key. The entity it names varies by `entityType`
 * (a user, eventually other admin-manageable records), so it cannot
 * reference one specific table — which is the normal, accepted shape of a
 * polymorphic audit reference.
 *
 * Append-only: see `packages/db/src/audit.ts` for the one function that
 * writes here, and `src/__tests__/audit-log-append-only.test.ts` for the
 * check that nothing else in the repo calls `db.update` or `db.delete`
 * against this table.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff").$type<AuditDiff | null>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "what has this account done, most recent first"
    index("audit_log_actor_created_idx").on(t.actorId, t.createdAt),
    // "who has touched this record" — the admin accountability question
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    // the auth-retention purge deletes by action prefix and age
    index("audit_log_action_created_idx").on(t.action, t.createdAt),
    // the credential-stuffing question, which has no actor id to filter on
    index("audit_log_ip_created_idx").on(t.ipAddress, t.createdAt),
  ],
);

export const selectAuditLogSchema = createSelectSchema(auditLog);

export const auditLogColumns = {
  id: auditLog.id,
  actorId: auditLog.actorId,
  action: auditLog.action,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  diff: auditLog.diff,
  ipAddress: auditLog.ipAddress,
  userAgent: auditLog.userAgent,
  createdAt: auditLog.createdAt,
} as const;

export type AuditLogRow = z.infer<typeof selectAuditLogSchema>;
export type AuditLogView = Pick<AuditLogRow, keyof typeof auditLogColumns>;
