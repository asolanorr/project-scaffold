import { projects } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn((_count: number) => Promise.resolve<unknown[]>([]));
const whereMock = vi.fn((_clause: unknown) => ({ limit: limitMock }));
const fromMock = vi.fn((_table: unknown) => ({ where: whereMock }));
const selectMock = vi.fn((_columns: unknown) => ({ from: fromMock }));

vi.mock("@repo/db", async (importOriginal) => ({
  // The table definitions are real — the predicate is only worth testing
  // against the schema the application actually ships. Only the connection is
  // replaced.
  ...(await importOriginal<typeof import("@repo/db")>()),
  db: { select: (columns: unknown) => selectMock(columns) },
}));

class NotFoundError extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

const { ownedBy, requireOwned } = await import("../ownership");

const dialect = new PgDialect();
const toSql = (clause: ReturnType<typeof ownedBy>) => dialect.sqlToQuery(clause);

const columns = { id: projects.id, name: projects.name } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ownedBy", () => {
  it("constrains the row id", () => {
    const { sql, params } = toSql(ownedBy(projects, "p_1", "u_1"));

    expect(sql).toContain('"projects"."id" = $1');
    expect(params[0]).toBe("p_1");
  });

  // The whole point of the helper: an unscoped query would return another
  // user's row, and no amount of checking afterwards is as reliable.
  it("constrains the owner", () => {
    const { sql, params } = toSql(ownedBy(projects, "p_1", "u_1"));

    expect(sql).toContain('"projects"."owner_id" = $2');
    expect(params[1]).toBe("u_1");
  });

  // Rule 13: reads exclude soft-deleted rows. Restoring a deleted row must go
  // through a query that opts in, not through every ownership check.
  it("excludes soft-deleted rows", () => {
    const { sql } = toSql(ownedBy(projects, "p_1", "u_1"));

    expect(sql).toContain('"projects"."deleted_at" is null');
  });

  it("combines all three conditions with AND", () => {
    const { sql } = toSql(ownedBy(projects, "p_1", "u_1"));

    expect(sql.match(/ and /g)).toHaveLength(2);
    expect(sql).not.toContain(" or ");
  });

  // Ids arrive from the client. They are bound as parameters, never spliced
  // into the statement text.
  it("parameterises the values rather than inlining them", () => {
    const { sql, params } = toSql(ownedBy(projects, "'; drop table projects; --", "u_1"));

    expect(sql).not.toContain("drop table");
    expect(params).toContain("'; drop table projects; --");
  });
});

describe("requireOwned", () => {
  it("returns the row when the caller owns it", async () => {
    const row = { id: "p_1", name: "Acme" };
    limitMock.mockResolvedValue([row]);

    await expect(
      requireOwned({ table: projects, columns, id: "p_1", ownerId: "u_1" }),
    ).resolves.toEqual(row);
  });

  it("selects only the named columns", async () => {
    limitMock.mockResolvedValue([{ id: "p_1", name: "Acme" }]);

    await requireOwned({ table: projects, columns, id: "p_1", ownerId: "u_1" });

    expect(selectMock).toHaveBeenCalledWith(columns);
  });

  it("puts the ownership check in the WHERE clause", async () => {
    limitMock.mockResolvedValue([{ id: "p_1", name: "Acme" }]);

    await requireOwned({ table: projects, columns, id: "p_1", ownerId: "u_1" });

    expect(whereMock).toHaveBeenCalledTimes(1);
    const [clause] = whereMock.mock.calls[0] as unknown as [ReturnType<typeof ownedBy>];
    expect(toSql(clause).params).toEqual(["p_1", "u_1"]);
  });

  // A row owned by someone else and a row that does not exist must be
  // indistinguishable to the caller, or the 404 becomes a 403 in disguise.
  it("raises not-found when the row belongs to another user", async () => {
    limitMock.mockResolvedValue([]);

    await expect(
      requireOwned({ table: projects, columns, id: "p_1", ownerId: "someone-else" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("raises not-found when the row does not exist", async () => {
    limitMock.mockResolvedValue([]);

    await expect(
      requireOwned({ table: projects, columns, id: "missing", ownerId: "u_1" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("never resolves to undefined", async () => {
    limitMock.mockResolvedValue([]);

    const result = await requireOwned({
      table: projects,
      columns,
      id: "p_1",
      ownerId: "u_1",
    }).catch((error) => error);

    expect(result).toBeInstanceOf(NotFoundError);
  });
});
