import { db, projects } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheTags } from "@/lib/cache-tags";
import { form, OTHER, OWNER, RedirectError, seedUsers, sessionFor } from "./fixtures";

// Only the session is replaced. `ownedBy` and the rest of @repo/auth are
// real — the predicate under test is the one the application ships.
const requireSessionMock = vi.fn();
vi.mock("@repo/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/auth")>()),
  requireSession: () => requireSessionMock(),
}));

const updateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  updateTag: (tag: string) => updateTagMock(tag),
}));

vi.mock("server-only", () => ({}));

const { createProject, deleteProject, restoreProject, updateProject } = await import("../actions");
const { listProjects } = await import("../queries");

setupTestTransaction();

const initial = { ok: false } as const;
const defaultFilters = { page: 1, pageSize: 20, sort: "createdAt", dir: "desc" } as const;

const signedInAs = (user: typeof OWNER) => requireSessionMock.mockResolvedValue(sessionFor(user));
const signedOut = () =>
  requireSessionMock.mockImplementation(() => {
    throw new RedirectError("/sign-in");
  });

async function createOwned(name = "Alpha") {
  signedInAs(OWNER);
  const result = await createProject(initial, form({ name }));
  if (!result.ok) throw new Error(`fixture create failed: ${JSON.stringify(result)}`);
  return result.data;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await seedUsers();
});

describe("createProject", () => {
  it("redirects an unauthenticated request before touching the database", async () => {
    signedOut();

    await expect(createProject(initial, form({ name: "Alpha" }))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    // Scoped to this test's users: the database is shared, so other rows may
    // exist, but nothing may have been written on their behalf.
    expect(await db.select().from(projects).where(eq(projects.ownerId, OWNER.id))).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.ownerId, OTHER.id))).toHaveLength(0);
  });

  it("returns field errors as message keys on invalid input", async () => {
    signedInAs(OWNER);

    const result = await createProject(initial, form({ name: "x" }));

    expect(result).toEqual({ ok: false, errors: { name: ["tooShort"] } });
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  // The .pick() allowlist: whatever the form sends, only name, description and
  // status reach the insert. The owner is the session, not the request.
  it("silently drops fields outside the allowlist", async () => {
    signedInAs(OWNER);

    const result = await createProject(
      initial,
      form({
        name: "Alpha",
        ownerId: OTHER.id,
        deletedAt: "2020-01-01T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(projects).where(eq(projects.id, result.data.id));
    expect(row?.ownerId).toBe(OWNER.id);
    expect(row?.deletedAt).toBeNull();
    expect(row?.id).not.toBe("00000000-0000-4000-8000-000000000000");
  });

  it("creates the project, returns named columns and invalidates the list", async () => {
    signedInAs(OWNER);

    const result = await createProject(
      initial,
      form({ name: "Alpha", description: "First", status: "active" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data).sort()).toEqual(
      ["createdAt", "description", "id", "name", "status", "updatedAt"].sort(),
    );
    expect(result.data).toMatchObject({ name: "Alpha", description: "First", status: "active" });
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.projects(OWNER.id));
  });

  it("reports a duplicate name as a code, not a database error", async () => {
    await createOwned("Alpha");

    const result = await createProject(initial, form({ name: "Alpha" }));

    expect(result).toEqual({ ok: false, code: "nameTaken" });
  });
});

describe("updateProject", () => {
  it("redirects an unauthenticated request", async () => {
    const project = await createOwned();
    signedOut();

    await expect(updateProject(initial, form({ id: project.id, name: "Beta" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("answers not-found for another user's project and changes nothing", async () => {
    const project = await createOwned();
    updateTagMock.mockClear();
    signedInAs(OTHER);

    const result = await updateProject(initial, form({ id: project.id, name: "Hijacked" }));

    expect(result).toEqual({ ok: false, code: "notFound" });
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.name).toBe("Alpha");
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("returns field errors as message keys on invalid input", async () => {
    const project = await createOwned();

    const result = await updateProject(initial, form({ id: project.id, status: "bogus" }));

    expect(result).toEqual({ ok: false, errors: { status: ["invalid"] } });
  });

  it("drops fields outside the allowlist", async () => {
    const project = await createOwned();

    const result = await updateProject(
      initial,
      form({ id: project.id, name: "Beta", ownerId: OTHER.id }),
    );

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row).toMatchObject({ name: "Beta", ownerId: OWNER.id });
  });

  it("updates the owner's project and invalidates both tags", async () => {
    const project = await createOwned();
    updateTagMock.mockClear();

    const result = await updateProject(initial, form({ id: project.id, status: "archived" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ id: project.id, name: "Alpha", status: "archived" });
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.projects(OWNER.id));
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.project(project.id));
  });
});

describe("deleteProject and restoreProject", () => {
  it("redirects an unauthenticated request", async () => {
    const project = await createOwned();
    signedOut();

    await expect(deleteProject(initial, form({ id: project.id }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(restoreProject(initial, form({ id: project.id }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("answers not-found when the caller is not the owner", async () => {
    const project = await createOwned();
    signedInAs(OTHER);

    expect(await deleteProject(initial, form({ id: project.id }))).toEqual({
      ok: false,
      code: "notFound",
    });
    expect((await listProjects(OWNER.id, defaultFilters)).items).toHaveLength(1);
  });

  it("answers not-found for an id that is not a uuid", async () => {
    signedInAs(OWNER);

    expect(await deleteProject(initial, form({ id: "1 OR 1=1" }))).toEqual({
      ok: false,
      code: "notFound",
    });
  });

  it("soft-deletes: the row stays, the list no longer shows it", async () => {
    const project = await createOwned();

    const result = await deleteProject(initial, form({ id: project.id }));

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect((await listProjects(OWNER.id, defaultFilters)).items).toHaveLength(0);
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.project(project.id));
  });

  it("deleting twice answers not-found the second time", async () => {
    const project = await createOwned();
    await deleteProject(initial, form({ id: project.id }));

    expect(await deleteProject(initial, form({ id: project.id }))).toEqual({
      ok: false,
      code: "notFound",
    });
  });

  it("restore brings a deleted project back into the list", async () => {
    const project = await createOwned();
    await deleteProject(initial, form({ id: project.id }));

    const result = await restoreProject(initial, form({ id: project.id }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(project.id);
    const page = await listProjects(OWNER.id, defaultFilters);
    expect(page.items.map((p) => p.id)).toEqual([project.id]);
  });

  it("restore answers not-found for a project that is not deleted", async () => {
    const project = await createOwned();

    expect(await restoreProject(initial, form({ id: project.id }))).toEqual({
      ok: false,
      code: "notFound",
    });
  });

  it("restore refuses when the name was reused while deleted", async () => {
    const first = await createOwned("Alpha");
    await deleteProject(initial, form({ id: first.id }));
    await createOwned("Alpha");

    expect(await restoreProject(initial, form({ id: first.id }))).toEqual({
      ok: false,
      code: "nameTaken",
    });
  });
});
