import { env } from "@repo/env";
import { eq, inArray } from "drizzle-orm";

/**
 * Seeding writes real rows with no undo, and now creates real, sign-in-able
 * accounts with a known password — the host check matters more than it did
 * when this only inserted data. It stays unconditional: not a flag, not a
 * prompt that can be answered yes. Verified after every change to this file
 * that it still refuses a non-local DATABASE_URL.
 */
function assertLocalHost(url: string): void {
  const { hostname } = new URL(url);
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    console.error(
      `db:seed refuses to run against "${hostname}". DATABASE_URL must point at a local ` +
        "database (e.g. the Supabase CLI's local stack on localhost) to seed it.",
    );
    process.exit(1);
  }
}

assertLocalHost(env.DATABASE_URL);

// Imported only after the host check passes, so a misconfigured DATABASE_URL
// never gets far enough to open a connection.
//
// This lives in @repo/auth rather than @repo/db, where the rest of the seed
// data's shape would otherwise suggest: @repo/db cannot import @repo/auth
// without a circular package dependency (auth already depends on db), and
// creating the accounts through anything but Better Auth's own API would
// mean a second, parallel password-hashing path that could silently drift
// from the one sign-up actually uses.
const { auth } = await import("./auth");
const { db, files, projects, users } = await import("@repo/db");

const SEED_PASSWORD = "seed-password-123";
const OWNER_EMAIL = "owner@seed.local";
const OTHER_EMAIL = "other@seed.local";

const PROJECT_STATUSES = ["draft", "active", "archived"] as const;

// Fixed calendar dates rather than offsets from `new Date()`: a seed run six
// months from now must sort and paginate identically to one today.
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

// One more than the default page size (20) — the project list must actually
// paginate, not just render a single page.
const LIVE_PROJECT_COUNT = 22;

/**
 * Creates the account the same way sign-up does — same password hashing,
 * same `accounts` row — then flips `emailVerified` directly, bypassing the
 * email round-trip: `REQUIRE_EMAIL_VERIFICATION` is on by default, and an
 * unverified seed account cannot sign in, which would defeat the point.
 *
 * Calling `auth.api.signUpEmail` directly, not through `callAuthEndpoint`,
 * is deliberate here and nowhere else: that rule (AGENTS.md #16) protects a
 * *running app* from skipping rate limiting and the origin check on live
 * traffic. This is offline tooling with no request to protect — the
 * concern doesn't apply, and `callAuthEndpoint` needs `next/headers`, which
 * throws outside a request.
 *
 * Returns the id Better Auth assigned — not a fixed seed id, since
 * `signUpEmail` generates its own and there is no way to pin it.
 */
async function createSeedAccount(email: string, name: string): Promise<string> {
  const result = await auth.api.signUpEmail({
    body: { email, password: SEED_PASSWORD, name },
    headers: new Headers({ "user-agent": "scaffold-db-seed" }),
  });
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, result.user.id));
  return result.user.id;
}

async function main(): Promise<void> {
  // Deleting any existing seed accounts cascades to their projects and
  // files, so re-running the script replaces the seed data instead of
  // duplicating it, without truncating tables that might hold other local
  // data. Matched by email, not a fixed id: signUpEmail assigns its own.
  await db.delete(users).where(inArray(users.email, [OWNER_EMAIL, OTHER_EMAIL]));

  const ownerId = await createSeedAccount(OWNER_EMAIL, "Owner");
  const otherId = await createSeedAccount(OTHER_EMAIL, "Other");

  const liveProjects = Array.from({ length: LIVE_PROJECT_COUNT }, (_, i) => ({
    name: `Project ${String(i + 1).padStart(2, "0")}`,
    status: PROJECT_STATUSES[i % PROJECT_STATUSES.length],
    ownerId,
    createdAt: day(i),
  }));

  await db.insert(projects).values([
    ...liveProjects,
    {
      name: "Deleted project",
      status: "archived",
      ownerId,
      createdAt: day(LIVE_PROJECT_COUNT),
      deletedAt: day(LIVE_PROJECT_COUNT + 1),
    },
    {
      name: "Their project",
      status: "active",
      ownerId: otherId,
      createdAt: day(0),
    },
  ]);

  // Relative to now, deliberately: the purge job's window is relative to now
  // too, so this is the one row that has to be for the job to find it.
  await db.insert(files).values({
    ownerId,
    storageKey: `${ownerId}/seed-pending.png`,
    originalName: "pending-upload.png",
    mimeType: "image/png",
    size: 1024,
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  });

  console.log(
    [
      "",
      `Seeded ${LIVE_PROJECT_COUNT + 2} projects and 1 pending file.`,
      "",
      "Sign in at /sign-in with either account:",
      `  ${OWNER_EMAIL}  /  ${SEED_PASSWORD}   — owns the projects above`,
      `  ${OTHER_EMAIL}  /  ${SEED_PASSWORD}   — owns one project of their own;`,
      "    sign in as this one and confirm the owner's projects are not there",
      "",
    ].join("\n"),
  );
}

await main();
process.exit(0);
