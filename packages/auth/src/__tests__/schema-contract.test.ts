import { getAuthTables } from "@better-auth/core/db";
import { initGetModelName } from "@better-auth/core/db/adapter";
import * as schema from "@repo/db";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// Better Auth reaches the database by looking up `schema[modelName]` on the
// Drizzle instance. With `usePlural: true` its singular models — user, session,
// account, verification, rateLimit — become these export names.
//
// Nothing here is checked at compile time: renaming an export in
// packages/db/src/schema/auth.ts, or dropping a field Better Auth writes,
// typechecks cleanly and then fails at runtime on the first sign-in. These
// tests are the compile-time check that does not exist.
const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  // `locale` and `role` are additional fields (see email-flows.userLocaleField
  // and admin.userRoleField).
  users: [
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "locale",
    "role",
    "createdAt",
    "updatedAt",
  ],
  sessions: [
    "id",
    "expiresAt",
    "token",
    "createdAt",
    "updatedAt",
    "ipAddress",
    "userAgent",
    "userId",
  ],
  accounts: [
    "id",
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ],
  verifications: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
  rateLimits: ["id", "key", "count", "lastRequest"],
};

describe.each(Object.entries(REQUIRED_FIELDS))("%s", (exportName, fields) => {
  const table = (schema as unknown as Record<string, PgTable | undefined>)[exportName];

  it("is exported from @repo/db under the name the adapter resolves", () => {
    expect(table).toBeDefined();
  });

  it("has every field Better Auth reads and writes", () => {
    expect(Object.keys(getTableColumns(table as PgTable)).sort()).toEqual([...fields].sort());
  });
});

describe("table names", () => {
  it("are plural, which is what usePlural: true assumes", () => {
    expect(getTableName(schema.users)).toBe("users");
    expect(getTableName(schema.sessions)).toBe("sessions");
    expect(getTableName(schema.accounts)).toBe("accounts");
    expect(getTableName(schema.verifications)).toBe("verifications");
  });

  // The rate limit table is the one exception: its export is plural so the
  // adapter finds it, but the SQL name is snake_case like every other table,
  // which is why auth.ts passes `modelName: "rateLimits"` explicitly.
  it("are snake_case in SQL", () => {
    expect(getTableName(schema.rateLimits)).toBe("rate_limits");
  });
});

// `usePlural: true` is the only thing pointing Better Auth's singular models at
// this schema's plural exports, and getting it wrong is a runtime failure that
// typechecks perfectly. Resolving the names here, through Better Auth's own
// resolver, is the only way to see it before a request does.
describe("model name resolution", () => {
  const resolve = (rateLimit: { enabled: boolean; storage: "database"; modelName?: string }) =>
    initGetModelName({
      usePlural: true,
      schema: getAuthTables({ emailAndPassword: { enabled: true }, rateLimit }),
    });

  const rateLimit = { enabled: true, storage: "database" } as const;

  it.each([
    ["user", "users"],
    ["session", "sessions"],
    ["account", "accounts"],
    ["verification", "verifications"],
    ["rateLimit", "rateLimits"],
  ])("resolves %s to the %s export", (model, expected) => {
    expect(resolve(rateLimit)(model)).toBe(expected);
    expect(Object.keys(schema)).toContain(expected);
  });

  // The reason auth.ts does not set `rateLimit.modelName`. An explicit override
  // is pluralised on top of itself, and the adapter then looks for a table that
  // does not exist — but only once a request is actually rate limited, which is
  // the worst moment to find out.
  it("double-pluralises an explicit modelName, which is why auth.ts omits it", () => {
    expect(resolve({ ...rateLimit, modelName: "rateLimits" })("rateLimit")).toBe("rateLimitss");
  });
});
