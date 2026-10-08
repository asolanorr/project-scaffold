import { db, projects } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheTags } from "@/lib/cache-tags";
import { OTHER, OWNER, seedUsers } from "@/test/fixtures";

const cacheTagMock = vi.fn();
vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]) => cacheTagMock(...tags),
  updateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));

const { getProject, listProjects } = await import("../queries");

setupTestTransaction();

const filters = { page: 1, pageSize: 20, sort: "createdAt", dir: "desc" } as const;

// Rows for both users, inserted directly: these tests are about reading, and
// going through the actions would make a read failure look like a write one.
async function seedProjects() {
  const insert = async (values: typeof projects.$inferInsert) => {
    const [row] = await db.insert(projects).values(values).returning({ id: projects.id });
    if (!row) throw new Error("seed insert returned no row");
    return row;
  };
  // Explicit timestamps: inside one transaction `now()` is frozen at the
  // transaction start, so defaults would tie and the order would be random.
  const alpha = await insert({
    name: "Alpha",
    status: "active",
    ownerId: OWNER.id,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  await insert({
    name: "Beta 100%",
    status: "draft",
    ownerId: OWNER.id,
    createdAt: new Date("2026-01-02T00:00:00Z"),
  });
  const gone = await insert({
    name: "Gone",
    status: "active",
    ownerId: OWNER.id,
    deletedAt: new Date(),
  });
  const theirs = await insert({ name: "Alpha", status: "active", ownerId: OTHER.id });
  return { alpha, gone, theirs };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await seedUsers();
});

describe("listProjects", () => {
  it("returns only the caller's live projects, newest first", async () => {
    await seedProjects();

    const page = await listProjects(OWNER.id, filters);

    expect(page.items.map((p) => p.name)).toEqual(["Beta 100%", "Alpha"]);
    expect(page.total).toBe(2);
  });

  it("selects named columns only", async () => {
    await seedProjects();

    const [first] = (await listProjects(OWNER.id, filters)).items;

    expect(first).toBeDefined();
    expect(first).not.toHaveProperty("ownerId");
    expect(first).not.toHaveProperty("deletedAt");
  });

  it("tags the cache with the user id it was given", async () => {
    await listProjects(OWNER.id, filters);

    expect(cacheTagMock).toHaveBeenCalledWith(cacheTags.projects(OWNER.id));
  });

  it("sorts by the requested column and direction", async () => {
    await seedProjects();

    const byName = await listProjects(OWNER.id, { ...filters, sort: "name", dir: "asc" });
    const byNameDesc = await listProjects(OWNER.id, { ...filters, sort: "name", dir: "desc" });

    expect(byName.items.map((p) => p.name)).toEqual(["Alpha", "Beta 100%"]);
    expect(byNameDesc.items.map((p) => p.name)).toEqual(["Beta 100%", "Alpha"]);
  });

  it("filters by status", async () => {
    await seedProjects();

    const page = await listProjects(OWNER.id, { ...filters, status: "draft" });

    expect(page.items.map((p) => p.name)).toEqual(["Beta 100%"]);
  });

  it("searches by name without treating % or _ as wildcards", async () => {
    await seedProjects();

    expect((await listProjects(OWNER.id, { ...filters, q: "alp" })).total).toBe(1);
    expect((await listProjects(OWNER.id, { ...filters, q: "100%" })).total).toBe(1);
    expect((await listProjects(OWNER.id, { ...filters, q: "%" })).total).toBe(1);
    expect((await listProjects(OWNER.id, { ...filters, q: "_" })).total).toBe(0);
  });

  it("paginates and reports the total across pages", async () => {
    await seedProjects();

    const first = await listProjects(OWNER.id, { ...filters, page: 1, pageSize: 1 });
    const second = await listProjects(OWNER.id, { ...filters, page: 2, pageSize: 1 });

    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
    expect(first.total).toBe(2);
  });

  it("returns an empty page for a user with nothing", async () => {
    await seedProjects();

    expect(await listProjects("u_nobody", filters)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});

describe("getProject", () => {
  it("returns the owner's project with named columns", async () => {
    const { alpha } = await seedProjects();

    const project = await getProject(OWNER.id, alpha.id);

    expect(project).toMatchObject({ id: alpha.id, name: "Alpha", status: "active" });
    expect(project).not.toHaveProperty("ownerId");
    expect(cacheTagMock).toHaveBeenCalledWith(
      cacheTags.project(alpha.id),
      cacheTags.projects(OWNER.id),
    );
  });

  // Three different reasons, one answer. Distinguishing them would tell a
  // caller which ids exist.
  it("returns null for another user's project", async () => {
    const { theirs } = await seedProjects();

    expect(await getProject(OWNER.id, theirs.id)).toBeNull();
  });

  it("returns null for a deleted project", async () => {
    const { gone } = await seedProjects();

    expect(await getProject(OWNER.id, gone.id)).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    await seedProjects();

    expect(await getProject(OWNER.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
