/**
 * Route prefixes the middleware treats specially, written without a locale.
 *
 * Middleware sees URLs, not route groups: `(app)` and `(auth)` do not appear in
 * the pathname, so membership has to be declared here. A route added under
 * `(app)/` without an entry in PROTECTED is reachable signed-out — which the
 * page's own `requireSession()` will still catch, because this list is UX and
 * not the authorization boundary.
 */
export const PROTECTED_PREFIXES = ["/dashboard"] as const;

/** Signed-in users have no reason to see these, so they get bounced onward. */
export const AUTH_PREFIXES = ["/sign-in", "/sign-up"] as const;

export const SIGN_IN_PATH = "/sign-in";
export const AFTER_SIGN_IN_PATH = "/dashboard";

/** Query parameter carrying where the user was headed before the redirect. */
export const RETURN_TO_PARAM = "next";

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
