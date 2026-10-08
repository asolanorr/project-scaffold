import type { Route } from "next";

/**
 * The only file in the repo allowed to contain an internal path string.
 *
 * Every href prop, `router.push`/`replace`/`prefetch` call, `redirect()`, and
 * next-intl navigation call takes its path from here — never writes its own
 * literal. See AGENTS.md's rules list: a path literal anywhere else is a
 * review blocker.
 *
 * Next's typedRoutes checks `next/link` and `next/navigation` against the
 * routes it actually generated (apps/web/.next/types, loaded through the
 * `include` entry in tsconfig.json), but this app never calls those directly
 * — next-intl's navigation helpers add and strip the locale prefix, and its
 * own `Link`/`redirect` do not carry the generated types the way `next/link`
 * does. So the generated types are used here instead, once per path, through
 * `Validated` below. Every exported path is checked against a real route;
 * delete the page and the constant that named it stops compiling, which is
 * the whole point — see the audit note in ARCHITECTURE.md's setup section.
 *
 * `Validated` prepends a fake locale segment before asking: every real route
 * in this app lives under the dynamic `[locale]` segment, and the paths
 * exported here are deliberately locale-free (next-intl adds the real locale
 * back at render/navigation time). One path can't be checked this way:
 * `HOME_PATH`. A path with nothing after the locale collides with the
 * locale segment itself in the generated type — "/anything" type-checks as
 * "the home page with locale=anything" whether or not "anything" is real.
 * That collision only bites a path with zero segments of its own; every
 * other path here has at least one real segment after the fake locale and is
 * genuinely checked against the generated routes.
 */
type Validated<P extends string> = Route<`/_locale_${P}`> extends never ? never : P;

/** Not validated — see the collision note above. */
export const HOME_PATH = "/";

export const SIGN_IN_PATH: Validated<"/sign-in"> = "/sign-in";
export const SIGN_UP_PATH: Validated<"/sign-up"> = "/sign-up";
export const CHECK_EMAIL_PATH: Validated<"/check-email"> = "/check-email";
export const FORGOT_PASSWORD_PATH: Validated<"/forgot-password"> = "/forgot-password";
export const RESET_PASSWORD_PATH: Validated<"/reset-password"> = "/reset-password";
export const DASHBOARD_PATH: Validated<"/dashboard"> = "/dashboard";
export const AFTER_SIGN_IN_PATH = DASHBOARD_PATH;

export const ADMIN_USERS_PATH: Validated<"/admin/users"> = "/admin/users";

/** One page per user id — built, not stored, so there is nothing to list here. */
export function adminUserPath(id: string): `/admin/users/${string}` {
  return `/admin/users/${id}`;
}

// The projects feature is the reference implementation (see AGENTS.md); its
// paths live here like every other feature's. Deleting the feature without
// deleting these two lines is exactly the mistake this file exists to catch
// — see the throwaway-branch verification in ARCHITECTURE.md.
export const PROJECTS_PATH: Validated<"/projects"> = "/projects";
export const PROJECTS_NEW_PATH: Validated<"/projects/new"> = "/projects/new";

/** One page per project id — built, not stored, so there is nothing to list here. */
export function projectPath(id: string): `/projects/${string}` {
  return `/projects/${id}`;
}

export function projectEditPath(id: string): `/projects/${string}/edit` {
  return `/projects/${id}/edit`;
}

export const CHECKOUT_SUCCESS_PATH: Validated<"/checkout/success"> = "/checkout/success";
export const CHECKOUT_CANCEL_PATH: Validated<"/checkout/cancel"> = "/checkout/cancel";

// Compile-time proof that the dynamic routes above are real. `Validated`
// only accepts a specific literal, not the `${string}` the functions above
// return, so each dynamic route gets one representative literal checked
// here; if its page is deleted, this is where the build fails.
const _adminUserRouteExists: Validated<"/admin/users/_id_"> = "/admin/users/_id_";
const _projectRouteExists: Validated<"/projects/_id_"> = "/projects/_id_";
const _projectEditRouteExists: Validated<"/projects/_id_/edit"> = "/projects/_id_/edit";
void _adminUserRouteExists;
void _projectRouteExists;
void _projectEditRouteExists;

/**
 * Route prefixes the middleware treats specially, written without a locale.
 *
 * Middleware sees URLs, not route groups: `(app)` and `(auth)` do not appear in
 * the pathname, so membership has to be declared here. A route added under
 * `(app)/` without an entry in PROTECTED is reachable signed-out — which the
 * page's own `requireSession()` will still catch, because this list is UX and
 * not the authorization boundary.
 */
// `/admin` is deliberately absent. This list only redirects a signed-out
// visitor to sign-in — exactly the "login prompt" an admin route must never
// show, to anyone, including someone with no session at all. `requireAdmin()`
// in the `(admin)` layout is the real gate, and it 404s every non-admin
// identically regardless of what middleware does here.
export const PROTECTED_PREFIXES = [DASHBOARD_PATH, PROJECTS_PATH] as const;

/** Signed-in users have no reason to see these, so they get bounced onward. */
export const AUTH_PREFIXES = [SIGN_IN_PATH, SIGN_UP_PATH, FORGOT_PASSWORD_PATH] as const;

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
