import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

// The security-relevant subset of the audit log. A full activity log can wait;
// these events cannot, because without them a compromise has nothing to
// investigate after the fact. See ARCHITECTURE.md §10, "Authentication
// hygiene".
//
// Only `sign_in`, `sign_in_failed` and `password_change` are written today.
// The remaining two are declared now because adding a value to a Postgres enum
// later is a migration, and an audit log that is missing events for the weeks
// it took to notice is the failure mode this table exists to prevent.
export const authEventType = pgEnum("auth_event_type", [
  "sign_in",
  "sign_in_failed",
  "password_change",
  "email_change",
  "session_revoked",
]);

export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // nullable on purpose: a failed sign-in against an address with no account
    // is exactly the pattern worth recording, and there is no user to point at.
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: authEventType("type").notNull(),
    // Full IP, not a hash. During an incident the question is "did this sign-in
    // come from a different country than the others", and a hash cannot answer
    // it. The 90-day retention in purgeExpiredAuthEvents is what keeps storing
    // it proportionate.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "what happened to this account, most recent first"
    index("auth_events_user_created_idx").on(t.userId, t.createdAt),
    // "how many failures from this address in the last hour" — the credential
    // stuffing question, which has no user id to filter on
    index("auth_events_ip_created_idx").on(t.ipAddress, t.createdAt),
    // the retention job deletes a whole age range
    index("auth_events_created_idx").on(t.createdAt),
  ],
);

export type AuthEventType = (typeof authEventType.enumValues)[number];
