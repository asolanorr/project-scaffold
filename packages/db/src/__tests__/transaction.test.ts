import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../client";
import { users } from "../schema";
import { isMigrated, setupTestTransaction } from "../testing";

// The harness under test. `db` here is the same import application code uses;
// the setup file has pointed it at the transaction `setupTestTransaction` opens.
const tx = setupTestTransaction();

const email = "rollback-probe@example.test";

describe("setupTestTransaction", () => {
  it("runs against a migrated database", async () => {
    expect(await isMigrated(tx())).toBe(true);
  });

  it("sees its own writes", async () => {
    await db.insert(users).values({ id: "probe-1", name: "Probe", email });

    const found = await db.select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(1);
  });

  it("does not see the previous test's writes", async () => {
    const found = await db.select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(0);
  });

  it("lets code under test open nested transactions", async () => {
    // Drizzle turns a transaction inside a transaction into a savepoint, so a
    // mutation that wraps its own work still lands in the rolled-back scope.
    await db.transaction(async (inner) => {
      await inner.insert(users).values({ id: "probe-2", name: "Nested", email });
    });

    const found = await db.select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(1);
  });
});
