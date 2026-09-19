import { getSessionCookie } from "better-auth/cookies";

/**
 * Edge-safe entry point.
 *
 * Deliberately separate from the package's main export: that one pulls in the
 * database client and next/headers, neither of which can run in the middleware
 * runtime. Nothing here may import ./auth.
 */

/**
 * Whether the request carries a session cookie.
 *
 * Presence only — this does not validate the cookie, and must not be used as an
 * authorization check. Validating means a database round trip on every request,
 * and it would buy nothing: a forged cookie gets someone as far as a page whose
 * own requireSession() rejects it.
 */
export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}
