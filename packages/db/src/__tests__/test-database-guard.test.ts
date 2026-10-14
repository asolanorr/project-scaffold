import { describe, expect, it } from "vitest";
import { assertTestDatabase, resolveTestUrls } from "../testing/database";

describe("assertTestDatabase", () => {
  it("refuses a database whose name does not end in _test, naming it", () => {
    expect(() =>
      assertTestDatabase("postgresql://postgres:secret@127.0.0.1:54322/postgres"),
    ).toThrow(/database "postgres" on 127\.0\.0\.1:54322/);
    expect(() => assertTestDatabase("postgresql://u:p@db.example.com/scaffold")).toThrow(
      /database "scaffold"/,
    );
  });

  it("says which variable it was reading and never prints the password", () => {
    let message = "";
    try {
      assertTestDatabase("postgresql://postgres:hunter2@localhost/prod", "TEST_DATABASE_URL");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("TEST_DATABASE_URL");
    expect(message).not.toContain("hunter2");
  });

  it("accepts a name ending in _test", () => {
    expect(() => assertTestDatabase("postgresql://u:p@localhost/scaffold_test")).not.toThrow();
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost/ci_test?sslmode=disable"),
    ).not.toThrow();
  });
});

describe("resolveTestUrls", () => {
  const dev = {
    DATABASE_URL: "postgresql://u:p@127.0.0.1:54322/postgres",
    DIRECT_URL: "postgresql://u:p@127.0.0.1:54322/postgres",
  };

  it("keeps the server and swaps in scaffold_test", () => {
    expect(resolveTestUrls(dev)).toEqual({
      databaseUrl: "postgresql://u:p@127.0.0.1:54322/scaffold_test",
      directUrl: "postgresql://u:p@127.0.0.1:54322/scaffold_test",
    });
  });

  it("leaves a URL that already names a _test database alone, as in CI", () => {
    const ci = {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/scaffold_test",
      DIRECT_URL: "postgres://postgres:postgres@localhost:5432/scaffold_test",
    };
    expect(resolveTestUrls(ci)).toEqual({ databaseUrl: ci.DATABASE_URL, directUrl: ci.DIRECT_URL });
  });

  it("lets TEST_DATABASE_URL win for both — which the guard then judges", () => {
    const urls = resolveTestUrls({ ...dev, TEST_DATABASE_URL: dev.DATABASE_URL });
    expect(urls.databaseUrl).toBe(dev.DATABASE_URL);
    expect(() => assertTestDatabase(urls.databaseUrl)).toThrow(/database "postgres"/);
  });
});
