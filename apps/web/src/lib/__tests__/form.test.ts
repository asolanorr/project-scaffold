import { describe, expect, it } from "vitest";
import { parseCheckbox, parseFormData } from "../form";

const build = (entries: [string, string][]) => {
  const formData = new FormData();
  for (const [key, value] of entries) formData.append(key, value);
  return formData;
};

describe("parseFormData", () => {
  it("reads single values", () => {
    expect(parseFormData(build([["email", "ada@example.com"]]))).toEqual({
      email: "ada@example.com",
    });
  });

  // The whole reason this function exists: Object.fromEntries keeps only the
  // last value, so every multi-select and checkbox group loses its contents.
  it("keeps every value of a repeated field", () => {
    expect(
      parseFormData(
        build([
          ["tag", "a"],
          ["tag", "b"],
          ["tag", "c"],
        ]),
      ),
    ).toEqual({
      tag: ["a", "b", "c"],
    });
  });

  it("keeps a two-value field as an array", () => {
    expect(
      parseFormData(
        build([
          ["tag", "a"],
          ["tag", "b"],
        ]),
      ).tag,
    ).toEqual(["a", "b"]);
  });

  it("trims surrounding whitespace", () => {
    expect(parseFormData(build([["name", "  Ada  "]]))).toEqual({ name: "Ada" });
  });

  // An untouched optional input submits "". Left alone it passes
  // z.string().optional() and writes a blank row.
  it("turns an empty value into undefined", () => {
    expect(parseFormData(build([["description", ""]]))).toEqual({ description: undefined });
  });

  it("turns a whitespace-only value into undefined", () => {
    expect(parseFormData(build([["description", "   "]]))).toEqual({ description: undefined });
  });

  // React posts these to route the submission. They are not user input and
  // must never reach a schema.
  it("drops React's action fields", () => {
    const parsed = parseFormData(
      build([
        ["$ACTION_ID_abc", "x"],
        ["email", "a@b.co"],
      ]),
    );
    expect(parsed).toEqual({ email: "a@b.co" });
  });

  it("drops empty values from a repeated field", () => {
    expect(
      parseFormData(
        build([
          ["tag", "a"],
          ["tag", ""],
          ["tag", "b"],
        ]),
      ).tag,
    ).toEqual(["a", "b"]);
  });

  it("does not coerce types, leaving that to the schema", () => {
    const parsed = parseFormData(
      build([
        ["count", "42"],
        ["active", "true"],
      ]),
    );
    expect(parsed).toEqual({ count: "42", active: "true" });
  });

  it("returns an empty object for empty form data", () => {
    expect(parseFormData(new FormData())).toEqual({});
  });

  it("keeps a file entry", () => {
    const formData = new FormData();
    formData.append("avatar", new File(["hello"], "a.png", { type: "image/png" }));
    const parsed = parseFormData(formData);
    expect(parsed.avatar).toBeInstanceOf(File);
  });

  // An empty file input still submits a zero-byte File with no name.
  it("turns an empty file input into undefined", () => {
    const formData = new FormData();
    formData.append("avatar", new File([], "", { type: "application/octet-stream" }));
    expect(parseFormData(formData)).toEqual({ avatar: undefined });
  });
});

describe("parseCheckbox", () => {
  // An unchecked box sends nothing at all, so a boolean schema never sees it.
  it("is false when the field is absent", () => {
    expect(parseCheckbox(new FormData(), "terms")).toBe(false);
  });

  it("is true for the browser's default value", () => {
    expect(parseCheckbox(build([["terms", "on"]]), "terms")).toBe(true);
  });

  it("is false for an explicit false", () => {
    expect(parseCheckbox(build([["terms", "false"]]), "terms")).toBe(false);
  });
});
