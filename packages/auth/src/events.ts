import { type AuthEventType, authEvents, db } from "@repo/db";
import { lt } from "drizzle-orm";

/**
 * How long an auth event is kept. Short enough to state plainly in a privacy
 * policy, long enough that an incident noticed a month late can still be
 * investigated.
 */
export const AUTH_EVENT_RETENTION_DAYS = 90;

/**
 * Endpoint paths whose outcome is worth recording, and the event each one
 * produces. Keyed by Better Auth's endpoint path so this stays a lookup table
 * rather than a chain of string comparisons in the hook.
 *
 * `/reset-password` is deliberately absent. It also changes a password, but it
 * runs with no session and returns only `{ status: true }`, so an event from
 * here would carry a null user id and tell an investigator nothing. Wiring it
 * up means reading the user out of the reset token, which belongs in the same
 * change that enables the reset flow — it cannot be sent until email is
 * configured, so nothing is being missed today.
 */
const EVENT_BY_PATH: Record<string, { onSuccess: AuthEventType; onFailure?: AuthEventType }> = {
  "/sign-in/email": { onSuccess: "sign_in", onFailure: "sign_in_failed" },
  "/change-password": { onSuccess: "password_change" },
};

/** The facts the resolver needs, lifted out of Better Auth's request context. */
export type AuthEventOutcome = {
  path: string;
  /** True when the endpoint returned an APIError rather than a result. */
  didFail: boolean;
  /** Session created by this request — present on a successful sign-in. */
  newSessionUserId?: string | null;
  /** Session the request was already authenticated with — set on /change-password. */
  sessionUserId?: string | null;
};

export type ResolvedAuthEvent = {
  type: AuthEventType;
  userId: string | null;
};

/**
 * Decide which event, if any, a finished auth request produced.
 *
 * Pure on purpose: the mapping from "what the endpoint did" to "what goes in
 * the log" is the part worth testing, and it should not need a database or a
 * Better Auth instance to exercise.
 */
export function resolveAuthEvent(outcome: AuthEventOutcome): ResolvedAuthEvent | null {
  const mapping = EVENT_BY_PATH[outcome.path];
  if (!mapping) return null;

  if (!outcome.didFail) {
    return {
      type: mapping.onSuccess,
      userId: outcome.newSessionUserId ?? outcome.sessionUserId ?? null,
    };
  }

  if (!mapping.onFailure) return null;

  // A failed sign-in has no session, and the user id is deliberately not
  // looked up from the submitted email — doing so would mean an existence
  // check on every failed attempt, which is the user-enumeration oracle the
  // sign-in response itself is careful not to be. The IP, the user agent and
  // the timestamp are what a credential-stuffing investigation actually reads.
  return { type: mapping.onFailure, userId: null };
}

export type AuthEventRequest = {
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * Append one event to the log.
 *
 * Never throws. This runs inside Better Auth's after-hook, where an exception
 * would surface to the caller as a failed sign-in — refusing to authenticate a
 * legitimate user because an audit insert timed out is the wrong trade.
 */
export async function logAuthEvent(
  event: ResolvedAuthEvent,
  request: AuthEventRequest,
): Promise<void> {
  try {
    await db.insert(authEvents).values({
      userId: event.userId,
      type: event.type,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    });
  } catch (error) {
    console.error("[auth] failed to write auth event", { type: event.type, error });
  }
}

/**
 * Delete events past the retention window. Intended for a scheduled job; there
 * is no scheduler in the scaffold yet, so today this is called by hand or from
 * a deploy step.
 */
export async function purgeExpiredAuthEvents(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - AUTH_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(authEvents).where(lt(authEvents.createdAt, cutoff));
}
