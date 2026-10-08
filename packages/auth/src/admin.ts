import { notFound } from "next/navigation";
import type { Session } from "./auth";
import { getSession } from "./session";

/**
 * Registered in `auth.ts`'s `user.additionalFields`. `input: false` is the
 * whole security property here: Better Auth returns and types this field on
 * every session, but refuses it from any request body — sign-up, the
 * update-user endpoint, anywhere a client could otherwise set it. The only
 * way to grant or revoke admin is a direct database write from an
 * admin-only action (see apps/web/src/features/admin/actions.ts), never
 * through Better Auth's own API.
 */
export const userRoleField = {
  role: {
    type: "string",
    required: true,
    defaultValue: "user",
    input: false,
  },
} as const;

/**
 * The authorization boundary for the entire admin section — the role check
 * the rest of the app's ownership scoping does not do.
 *
 * Deliberately `notFound()`, not a redirect to sign-in, and deliberately the
 * same for every failure mode: no session, a signed-in non-admin, and an
 * admin whose role was since revoked all land here identically. An admin
 * route must look exactly as absent to any of them as a route that does not
 * exist — including to a signed-out visitor, who must never see a sign-in
 * prompt that would confirm there is something here worth signing in for.
 *
 * `getSession()`, not `requireSession()`: the latter redirects on no
 * session, which is exactly the "login prompt" this must not show.
 *
 * Called from the `(admin)` layout for rendering, and again from every admin
 * Server Action — a layout guards pages, not the action functions a crafted
 * request could call directly.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (session?.user.role !== "admin") notFound();
  return session;
}
