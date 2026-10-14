import { describe, expect, it } from "vitest";
import { cacheTags } from "../cache-tags";

describe("cacheTags", () => {
  it("scopes a user's files to that user", () => {
    expect(cacheTags.files("u_1")).toBe("files:u_1");
    expect(cacheTags.files("u_2")).toBe("files:u_2");
  });

  // The failure this prevents: a cached read tagged without the user id serves
  // one user's rows to the next, which no permission check catches because the
  // code is right and the cache is wrong.
  it("never produces the same tag for two users", () => {
    expect(cacheTags.files("u_1")).not.toBe(cacheTags.files("u_2"));
  });

  it("keeps the collection and the record in separate namespaces", () => {
    expect(cacheTags.files("x")).not.toBe(cacheTags.file("x"));
  });

  it("is stable for the same argument", () => {
    expect(cacheTags.file("p_1")).toBe(cacheTags.file("p_1"));
  });
});
