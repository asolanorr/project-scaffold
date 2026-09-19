import { hasSessionCookie } from "@repo/auth/edge";
import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { localizedPath, routing, splitLocale } from "@/i18n/routing";
import {
  AFTER_SIGN_IN_PATH,
  AUTH_PREFIXES,
  matchesPrefix,
  PROTECTED_PREFIXES,
  RETURN_TO_PARAM,
  SIGN_IN_PATH,
} from "@/lib/routes";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createNonce,
  NONCE_HEADER,
} from "@/lib/security-headers";

const handleLocale = createIntlMiddleware(routing);

/**
 * One explicit chain, in one place: locale, then the auth redirect, then the
 * CSP nonce and the rest of the security headers.
 *
 * The order is not arbitrary, and each step depends on the one before it.
 *
 * 1. LOCALE runs first because every later step needs to know the language.
 *    next-intl resolves the locale from the path, the cookie or Accept-Language,
 *    and may answer with a redirect of its own (`/` → `/es`). It also rewrites
 *    `/sign-in` to the internal `/en/sign-in`, so anything that reads the path
 *    after this point would be reading the rewritten one — which is the second
 *    reason the auth step works from `request.nextUrl` rather than the result.
 *
 * 2. AUTH REDIRECT runs second because it has to build a localized URL. Sending
 *    a Spanish visitor to `/sign-in` instead of `/es/sign-in` would bounce them
 *    through step 1 again on the next request and lose their language. It runs
 *    only when step 1 passed the request through: if the locale step already
 *    answered with a redirect, that redirect comes back through this middleware
 *    and gets checked then, so doing it now would mean deciding against a URL
 *    the user is no longer going to.
 *
 * 3. CSP AND SECURITY HEADERS run last because they decorate whatever response
 *    the first two produced, redirects included — a redirect still needs HSTS
 *    and nosniff. The nonce itself is minted at the top rather than here: it
 *    has to be on the *request* headers for Next to stamp it onto its own
 *    script tags, and next-intl copies those headers onto the response it
 *    builds in step 1. So the value is created first and applied last.
 */
//#region chain
export default function middleware(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);

  // Next reads the nonce out of the request's content-security-policy header
  // and applies it to every script it renders. Setting it here, before step 1,
  // is what gets it forwarded — next-intl copies `request.headers` onto the
  // response it returns.
  request.headers.set(NONCE_HEADER, nonce);
  request.headers.set("content-security-policy", csp);

  // ---- 1. locale -----------------------------------------------------------
  const response = handleLocale(request);

  // ---- 2. auth redirect ----------------------------------------------------
  const isRedirect = response.status >= 300 && response.status < 400;
  const authResponse = isRedirect ? response : applyAuthRedirect(request);

  // ---- 3. CSP and security headers ----------------------------------------
  const final = authResponse ?? response;
  applySecurityHeaders(final.headers, csp);
  return final;
}
//#endregion

/**
 * Redirect signed-out visitors away from protected routes, and signed-in ones
 * away from the sign-in and sign-up pages.
 *
 * This checks for the presence of a session cookie, and deliberately does not
 * validate it. Validation means a database round trip on every request in the
 * edge runtime, and it would buy nothing: this is UX, not authorization. A
 * forged cookie gets someone as far as a page whose own `requireSession()`
 * then rejects it. Never remove a session check from an action or a query
 * because this exists — CVE-2025-29927 was a header that skipped middleware
 * entirely, and every app that had delegated authorization to it was open.
 */
function applyAuthRedirect(request: NextRequest): NextResponse | null {
  const { locale, pathname } = splitLocale(request.nextUrl.pathname);
  const isSignedIn = hasSessionCookie(request);

  if (!isSignedIn && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, SIGN_IN_PATH);
    url.search = "";
    // Where they were headed, so sign-in can send them back. Stored as a
    // path-only value; the action refuses anything else, because a full URL
    // here is an open redirect.
    url.searchParams.set(RETURN_TO_PARAM, `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (isSignedIn && matchesPrefix(pathname, AUTH_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, AFTER_SIGN_IN_PATH);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return null;
}

export const config = {
  // Everything except Next's own assets and files with an extension. The API
  // routes are excluded too: /api/auth is Better Auth's handler, which does its
  // own origin check and rate limiting and must not be locale-rewritten.
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
