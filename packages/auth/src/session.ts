import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./auth";
import { hasSessionCookie } from "./edge";

/** Where an unauthenticated request is sent. */
export const SIGN_IN_PATH = "/sign-in";
/** Mirrors apps/web/src/lib/routes.ts; the middleware reads it. */
export const STALE_SESSION_PARAM = "stale";

/**
 * Read the session without requiring one. Returns null for a signed-out
 * request — use it for pages that render differently rather than redirecting.
 */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * The first line of every server action and every authenticated query.
 *
 * Redirects by throwing, which is how `redirect()` works in Next: it raises a
 * framework control-flow error that the router catches. Never wrap a call to
 * this in a broad try/catch — a catch-all swallows that error and the request
 * carries on as though the user were authenticated.
 *
 * The middleware also redirects signed-out users, and that is not a
 * substitute. Middleware is UX; this is the authorization boundary. See
 * ARCHITECTURE.md §5 on CVE-2025-29927.
 */
export async function requireSession(): Promise<Session> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    // A cookie with no session behind it — expired, or revoked by a password
    // reset elsewhere — cannot be cleared from a Server Component. The
    // parameter tells the middleware not to treat the cookie as a sign-in and
    // bounce the sign-in page straight back here.
    const stale = hasSessionCookie(new Request("http://localhost", { headers: requestHeaders }));
    redirect(stale ? `${SIGN_IN_PATH}?${STALE_SESSION_PARAM}=1` : SIGN_IN_PATH);
  }
  return session;
}
