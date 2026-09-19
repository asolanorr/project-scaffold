import type { z } from "zod";

/**
 * Message keys the validation layer can produce, under the `validation`
 * namespace. The component renders `t(key)`; the schema never carries a
 * sentence.
 */
export const VALIDATION_KEYS = ["required", "tooShort", "tooLong", "invalid"] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];

/**
 * A Zod error map that turns every issue into one of the keys above.
 *
 * Pass it as `schema.safeParse(input, { error: messageKeys })`. Derived
 * schemas from `@repo/db` keep their default (English) messages at the source,
 * where they describe the column; this is where they become something a
 * component can translate. Unknown issue codes collapse to `invalid` rather
 * than leaking Zod's wording onto the screen.
 */
export const messageKeys: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined ? "required" : "invalid";
    case "too_small":
      return "tooShort";
    case "too_big":
      return "tooLong";
    default:
      return "invalid";
  }
};

export function toValidationKey(value: string | undefined): ValidationKey {
  return VALIDATION_KEYS.includes(value as ValidationKey) ? (value as ValidationKey) : "invalid";
}
