import { env } from "@repo/env";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { toNextJsHandler } from "better-auth/next-js";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";

/**
 * Route handlers for app/api/auth/[...all]. Exported from here so the app never
 * imports better-auth itself — that single indirection is what keeps auth
 * replaceable.
 */
export const authRouteHandlers = toNextJsHandler(auth.handler);

/**
 * Call a Better Auth endpoint from a Server Action, through the same HTTP
 * handler that serves /api/auth.
 *
 * Going through `auth.handler` rather than `auth.api.*` is the whole point.
 * Rate limiting and the origin check live in the router's `onRequest`, so a
 * direct `auth.api.signInEmail()` call silently skips both — sign-in becomes
 * unlimited, which is exactly the endpoint that must not be. Dispatching the
 * request here keeps one entry point for auth traffic whether it arrives over
 * the network or from an action in the same process.
 *
 * Set-Cookie has to be forwarded by hand for the same reason: the `nextCookies`
 * plugin deliberately stands down for router-dispatched requests, because in
 * the normal case the HTTP response already carries the cookies to the browser.
 * Here the response is consumed in-process, so nothing would reach the client.
 */
export async function callAuthEndpoint(
  path: `/${string}`,
  body: Record<string, unknown>,
): Promise<Response> {
  const incoming = await headers();

  const forwarded = new Headers({ "content-type": "application/json" });
  // The cookie carries an existing session; /change-password and /sign-out are
  // meaningless without it.
  copyHeader(incoming, forwarded, "cookie");
  // Better Auth re-validates this against baseURL. Next has already checked
  // Origin against Host for the action itself, so this is the second of two
  // independent checks rather than the only one — forward the real value
  // instead of asserting our own, or the check stops checking anything.
  copyHeader(incoming, forwarded, "origin");
  // Rate limiting buckets by IP, and the auth event log records it.
  copyHeader(incoming, forwarded, "x-forwarded-for");
  copyHeader(incoming, forwarded, "user-agent");

  const response = await auth.handler(
    new Request(new URL(`/api/auth${path}`, env.BETTER_AUTH_URL), {
      method: "POST",
      headers: forwarded,
      body: JSON.stringify(body),
    }),
  );

  await forwardSetCookie(response);
  return response;
}

function copyHeader(from: Headers, to: Headers, name: string): void {
  const value = from.get(name);
  if (value !== null) to.set(name, value);
}

/**
 * Copy the response's Set-Cookie headers onto Next's cookie store.
 *
 * `getSetCookie()` rather than `get("set-cookie")`: a single `get` joins
 * multiple cookies with a comma, and cookie values may legally contain one, so
 * parsing the joined string can split a cookie in the wrong place.
 */
async function forwardSetCookie(response: Response): Promise<void> {
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) return;

  const cookieStore = await cookies();
  for (const header of setCookies) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      if (!name) continue;
      cookieStore.set(name, attributes.value, toCookieOptions(attributes));
    }
  }
}
