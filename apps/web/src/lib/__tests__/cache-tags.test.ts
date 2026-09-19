import { describe, expect, it } from "vitest";
import { cacheTags } from "../cache-tags";

describe("cacheTags", () => {
  it("scopes a user's projects to that user", () => {
    expect(cacheTags.projects("u_1")).toBe("projects:u_1");
    expect(cacheTags.projects("u_2")).toBe("projects:u_2");
  });

  // The failure this prevents: a cached read tagged without the user id serves
  // one user's rows to the next, which no permission check catches because the
  // code is right and the cache is wrong.
  it("never produces the same tag for two users", () => {
    expect(cacheTags.projects("u_1")).not.toBe(cacheTags.projects("u_2"));
  });

  it("keeps the collection and the record in separate namespaces", () => {
    expect(cacheTags.projects("x")).not.toBe(cacheTags.project("x"));
  });

  it("is stable for the same argument", () => {
    expect(cacheTags.project("p_1")).toBe(cacheTags.project("p_1"));
  });
});
