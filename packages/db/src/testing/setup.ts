import { vi } from "vitest";
import { state } from "./state";

/**
 * Vitest setup file. Add it to a project's `setupFiles` and every import of
 * `db` from `@repo/db` in that project resolves to the current test's
 * transaction — or to the real client when the test did not open one.
 *
 * Only the client module is replaced, and only through a getter, so a test
 * file that never calls `setupTestTransaction()` pays nothing and needs no
 * database. See `./index` for the other half.
 */
vi.mock("../client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../client")>();
  state.real = original.db;
  return {
    ...original,
    get db() {
      return state.tx ?? original.db;
    },
  };
});
