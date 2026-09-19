/**
 * Route prefixes the middleware treats specially, written without a locale.
 *
 * Middleware sees URLs, not route groups: `(app)` and `(auth)` do not appear in
 * the pathname, so membership has to be declared here. A route added under
 * `(app)/` without an entry in PROTECTED is reachable signed-out — which the
 * page's own `requireSession()` will still catch, because this list is UX and
 * not the authorization boundary.
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/projects"] as const;

/** Signed-in users have no reason to see these, so they get bounced onward. */
export const AUTH_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password"] as const;

export const SIGN_IN_PATH = "/sign-in";
export const CHECK_EMAIL_PATH = "/check-email";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";
export const AFTER_SIGN_IN_PATH = "/dashboard";

/** Query parameter carrying where the user was headed before the redirect. */
export const RETURN_TO_PARAM = "next";

/**
 * Set by `requireSession()` when a request carried a session cookie that no
 * longer matches a session — expired, or revoked by a password reset on
 * another device. The middleware sees the cookie and would bounce the sign-in
 * page back to the dashboard, whose `requireSession()` would bounce it back
 * here: a loop. With this parameter present the middleware lets the sign-in
 * page render; signing in again replaces the stale cookie.
 */
export const STALE_SESSION_PARAM = "stale";

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
