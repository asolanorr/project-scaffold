/**
 * Values shared between the schema, the actions and the form components.
 *
 * Deliberately free of imports. The form is a client component, and anything it
 * imports goes into the browser bundle along with that module's whole
 * dependency graph — importing these from `./schema` pulled Zod across with
 * them. Keeping the constants here leaves Zod on the server, where the
 * validation actually runs.
 */

/**
 * Better Auth's own minimum. Declared once so the schema, the input's
 * `minLength` and the translated message cannot drift apart.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Form-level failures an auth action can report.
 *
 * Codes, not sentences: the action runs on the server with no locale, and the
 * component that renders the message is where the translation belongs. Each one
 * is a key under the `auth.errors` namespace.
 */
export const FORM_ERROR_KEYS = [
  "invalidCredentials",
  "emailTaken",
  "tooManyRequests",
  "unexpected",
] as const;

export type AuthErrorCode = (typeof FORM_ERROR_KEYS)[number];

/** Field-level message keys the auth schemas can produce. */
export const FIELD_ERROR_KEYS = ["emailInvalid", "passwordTooShort", "nameRequired"] as const;

export type FieldErrorKey = (typeof FIELD_ERROR_KEYS)[number];

/**
 * Narrow a key that arrived as a plain string.
 *
 * Zod hands back `string[]`, so the value is checked against the list before it
 * reaches `t()`. An unrecognised key renders the generic failure rather than
 * printing the key itself on screen, which is what a user would otherwise read.
 */
export function toFieldErrorKey(value: string | undefined): FieldErrorKey {
  return FIELD_ERROR_KEYS.includes(value as FieldErrorKey)
    ? (value as FieldErrorKey)
    : "emailInvalid";
}

export function toFormErrorKey(value: string | undefined): AuthErrorCode {
  return FORM_ERROR_KEYS.includes(value as AuthErrorCode) ? (value as AuthErrorCode) : "unexpected";
}
