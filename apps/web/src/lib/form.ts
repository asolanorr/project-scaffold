/**
 * Turn FormData into a plain object suitable for `schema.safeParse`.
 *
 * This exists because `Object.fromEntries(formData)` is wrong in two ways that
 * are invisible until someone reports a bug:
 *
 *   - it keeps only the last value of a repeated field, so every multi-select,
 *     checkbox group and multi-file input silently loses all but one entry;
 *   - it hands every value over as a string, so a Zod number, boolean or date
 *     field fails to parse unless every schema is littered with coercion.
 *
 * The coercion here is deliberately narrow. Empty strings become undefined so
 * that an untouched optional input reads as absent rather than as `""` — an
 * empty string passes `z.string().optional()` and then writes a blank row.
 * Everything else is left as a string and converted by the schema, which is the
 * only place that knows what the field is meant to be.
 */
export type ParsedFormValue = string | File | undefined | (string | File)[];

//#region parse
export function parseFormData(formData: FormData): Record<string, ParsedFormValue> {
  const result: Record<string, ParsedFormValue> = {};

  for (const [key, raw] of formData.entries()) {
    // React injects these to route the submission. They are not user input and
    // must never reach a schema.
    if (key.startsWith("$ACTION_")) continue;

    const value = normalize(raw);
    const existing = result[key];

    if (existing === undefined && !(key in result)) {
      result[key] = value;
      continue;
    }

    // A repeated key becomes an array, and stays an array from the second
    // occurrence on — the field is multi-valued regardless of how many values
    // happen to have arrived this time.
    result[key] = Array.isArray(existing)
      ? [...existing, value].filter(isPresent)
      : [existing, value].filter(isPresent);
  }

  return result;
}
//#endregion

/**
 * A checkbox that is unchecked sends nothing at all, so a schema expecting a
 * boolean never sees the field. Call this for each checkbox name to turn
 * "absent" into `false` and the browser's `"on"` into `true`.
 */
export function parseCheckbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value !== null && value !== "false";
}

function normalize(value: FormDataEntryValue): string | File | undefined {
  if (typeof value !== "string") {
    // An empty file input still submits a zero-byte File with an empty name.
    return value.size === 0 && value.name === "" ? undefined : value;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isPresent(value: string | File | undefined): value is string | File {
  return value !== undefined;
}
