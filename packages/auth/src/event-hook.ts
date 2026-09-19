import { createAuthMiddleware, getIP, isAPIError } from "better-auth/api";
import { logAuthEvent, resolveAuthEvent } from "./events";

/**
 * Better Auth `after` hook that writes the auth event log.
 *
 * Events are recorded here, once, rather than at each call site, so that a new
 * sign-in path cannot be added without one.
 *
 * `after` runs for failures as well as successes: an endpoint that threw an
 * `APIError` reaches the hook with that error as `context.returned` rather than
 * propagating past it, which is what makes a failed sign-in observable at all.
 *
 * Exported separately from the auth instance so the tests can drive it through
 * a real Better Auth pipeline instead of re-describing the shape of `ctx`.
 */
export const recordAuthEvent = createAuthMiddleware(async (ctx) => {
  const event = resolveAuthEvent({
    path: ctx.path,
    didFail: isAPIError(ctx.context.returned),
    newSessionUserId: ctx.context.newSession?.user?.id ?? null,
    sessionUserId: ctx.context.session?.user?.id ?? null,
  });
  if (!event) return;

  await logAuthEvent(event, {
    // Returns null unless the address is trustworthy: with no
    // `advanced.ipAddress.trustedProxies` configured a multi-hop
    // X-Forwarded-For is discarded rather than believed, because every value in
    // it can be set by the client. Configure trustedProxies for the
    // deployment's load balancer to record real addresses in production.
    ipAddress: getIP(ctx.headers ?? new Headers(), ctx.context.options),
    userAgent: ctx.headers?.get("user-agent") ?? null,
  });
});
