import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

// Better Auth's core schema, as reported by `getAuthTables()` for this
// project's options (email + password, database-backed rate limiting).
//
// Two deliberate departures from the generator's output:
//   - table and column names are plural / snake_case, which the adapter is
//     told about with `usePlural: true` in packages/auth. Keeping `users`
//     rather than `user` is what lets application tables reference it without
//     a quoted reserved-ish singular, and matches the naming used everywhere
//     else in this schema.
//   - timestamps are `timestamptz`, like every other table here. The
//     generator emits a bare `timestamp`, which silently drops the offset.
//
// Regenerate this file rather than hand-editing it when Better Auth options
// change in a way that adds fields (a plugin, an extra provider).

// A third manual departure, alongside plural naming and timestamptz: `role`
// gates the admin section (see packages/auth/src/admin.ts). Also an
// additional field in Better Auth's user model, but registered with
// `input: false` — unlike `locale`, nothing a request body sends is ever
// allowed to set it. The only way to change it is a direct database write
// from an admin-only action.
export const userRole = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // The language the account was created in. Mail the user did not ask for
  // in a request — a password-changed notice — is written in it; mail they
  // did ask for uses the request's locale. An additional field in Better
  // Auth's user model, set from the sign-up body.
  locale: text("locale").notNull().default("en"),
  role: userRole("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Derived, picked allowlist for the one legitimate write path to this table
// outside Better Auth itself: an admin editing another user's name or role.
// See apps/web/src/features/admin/actions.ts.
export const adminUpdateUserSchema = createInsertSchema(users, {
  name: (s) => s.min(1).max(200),
})
  .pick({ name: true, role: true })
  .partial();

export const adminUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  locale: users.locale,
  role: users.role,
  createdAt: users.createdAt,
} as const;

export type UserRole = (typeof userRole.enumValues)[number];
export type AdminUpdateUser = z.infer<typeof adminUpdateUserSchema>;
export type AdminUserView = Pick<typeof users.$inferSelect, keyof typeof adminUserColumns>;

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    // the bcrypt/scrypt hash for the credential provider. Never selected into
    // anything that leaves the server.
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// Backs `rateLimit.storage: "database"`. The default storage is per-instance
// memory, which on serverless means every cold start gets a fresh counter —
// that is, no effective limit at all. See packages/auth/src/auth.ts.
export const rateLimits = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  // epoch millis, not a timestamp: Better Auth compares it as a number.
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
