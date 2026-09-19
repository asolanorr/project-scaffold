import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./constants";

// Messages are translation keys under `auth.errors`, not sentences — the action
// that runs this schema has no locale, and the component that renders the
// result does.
const email = z.email({ error: "emailInvalid" });
const password = z.string({ error: "passwordTooShort" }).min(MIN_PASSWORD_LENGTH, {
  error: "passwordTooShort",
});

export const signInSchema = z.object({ email, password });

export const signUpSchema = z.object({
  name: z.string({ error: "nameRequired" }).min(1, { error: "nameRequired" }).max(120),
  email,
  password,
});

/** The forgot-password and resend-verification forms: an address, nothing else. */
export const emailOnlySchema = z.object({ email });

/** The reset form: the token from the link plus the new password. */
export const resetPasswordSchema = z.object({
  token: z.string({ error: "invalidToken" }).min(1, { error: "invalidToken" }),
  password,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Whether the value carries a control character.
 *
 * Written as a scan rather than a regex because a character class of control
 * characters is what `noControlCharactersInRegex` exists to catch, and here
 * finding them is the whole point — suppressing the rule would hide the next
 * one that is a genuine mistake.
 *
 * These matter because a newline or a NUL splits the value for anything
 * downstream that parses it, which is how a scheme gets smuggled past a check
 * that only looked at the first character.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Where to send the user after signing in.
 *
 * The value arrives from a query parameter, so it is attacker-controlled: an
 * unchecked one turns the sign-in page into an open redirect that borrows this
 * site's credibility to land someone on another host. Only a plain path on this
 * origin is allowed through.
 */
export function safeReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value === "") return fallback;
  // "//evil.com" is protocol-relative and "/\evil.com" is treated as one by
  // some browsers, so a leading slash alone is not enough.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  // A path on this origin carries no scheme.
  if (value.includes(":") || hasControlCharacter(value)) return fallback;
  return value;
}
