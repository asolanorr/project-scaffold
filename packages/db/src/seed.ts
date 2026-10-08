import { env } from "@repo/env";
import { inArray } from "drizzle-orm";

/**
 * Seeding writes real rows with no undo. The only thing standing between
 * this script and a client's production database is this check, so it has
 * to be unconditional — not a flag, not a prompt that can be answered yes.
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
const { db, files, projects, users } = await import("./index");

const OWNER = { id: "seed_u_owner", name: "Owner", email: "owner@seed.local" } as const;
const OTHER = { id: "seed_u_other", name: "Other", email: "other@seed.local" } as const;

const PROJECT_STATUSES = ["draft", "active", "archived"] as const;

// Fixed calendar dates rather than offsets from `new Date()`: a seed run six
// months from now must sort and paginate identically to one today.
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

// One more than the default page size (20) — the project list must actually
// paginate, not just render a single page.
const LIVE_PROJECT_COUNT = 22;

async function main(): Promise<void> {
  // Deleting the two seed users cascades to their projects and files, so
  // re-running the script replaces the seed data instead of duplicating it,
  // without truncating tables that might hold other local data.
  await db.delete(users).where(inArray(users.id, [OWNER.id, OTHER.id]));
  await db.insert(users).values([OWNER, OTHER]);

  const liveProjects = Array.from({ length: LIVE_PROJECT_COUNT }, (_, i) => ({
    name: `Project ${String(i + 1).padStart(2, "0")}`,
    status: PROJECT_STATUSES[i % PROJECT_STATUSES.length],
    ownerId: OWNER.id,
    createdAt: day(i),
  }));

  await db.insert(projects).values([
    ...liveProjects,
    {
      name: "Deleted project",
      status: "archived",
      ownerId: OWNER.id,
      createdAt: day(LIVE_PROJECT_COUNT),
      deletedAt: day(LIVE_PROJECT_COUNT + 1),
    },
    {
      name: "Their project",
      status: "active",
      ownerId: OTHER.id,
      createdAt: day(0),
    },
  ]);

  // Relative to now, deliberately: the purge job's window is relative to now
  // too, so this is the one row that has to be for the job to find it.
  await db.insert(files).values({
    ownerId: OWNER.id,
    storageKey: `${OWNER.id}/seed-pending.png`,
    originalName: "pending-upload.png",
    mimeType: "image/png",
    size: 1024,
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  });

  console.log(
    `Seeded ${LIVE_PROJECT_COUNT + 2} projects and 1 pending file for ${OWNER.email} / ${OTHER.email}.`,
  );
}

await main();
process.exit(0);
