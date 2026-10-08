import { appendAuditLog } from "@repo/db";

/** The auth events this app writes. Prefixed so they sort and filter apart
 * from admin actions in the same `audit_log` table — `action LIKE 'auth.%'`
 * is what a security-focused view would key off. */
export type AuthAction =
  | "auth.sign_in"
  | "auth.sign_in_failed"
  | "auth.password_change"
  | "auth.email_change"
  | "auth.session_revoked";

/**
 * Endpoint paths whose outcome is worth recording, and the action each one
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
const EVENT_BY_PATH: Record<string, { onSuccess: AuthAction; onFailure?: AuthAction }> = {
  "/sign-in/email": { onSuccess: "auth.sign_in", onFailure: "auth.sign_in_failed" },
  "/change-password": { onSuccess: "auth.password_change" },
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
  action: AuthAction;
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
      action: mapping.onSuccess,
      userId: outcome.newSessionUserId ?? outcome.sessionUserId ?? null,
    };
  }

  if (!mapping.onFailure) return null;

  // A failed sign-in has no session, and the user id is deliberately not
  // looked up from the submitted email — doing so would mean an existence
  // check on every failed attempt, which is precisely the user-enumeration
  // oracle the sign-in response itself is careful not to be. The IP, the
  // user agent and the timestamp are what a credential-stuffing
  // investigation actually reads.
  return { action: mapping.onFailure, userId: null };
}

export type AuthEventRequest = {
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * Append one auth event to the audit log.
 *
 * Never throws. This runs inside Better Auth's after-hook, where an exception
 * would surface to the caller as a failed sign-in — refusing to authenticate a
 * legitimate user because an audit insert timed out is the wrong trade.
 *
 * No retention purge exists for these rows, or for anything else in
 * `audit_log` — see the table's own doc comment in packages/db. The table
 * used to be `auth_events` with a 90-day deletion job; generalizing it into
 * an append-only audit log retired that job (packages/auth no longer
 * exports `purgeExpiredAuthEvents`, and `apps/web/src/jobs/purge-auth-events`
 * is gone), because "deletes rows older than N days" and "nothing in
 * application code ever deletes a row here" cannot both be true of the same
 * table.
 */
export async function logAuthEvent(
  event: ResolvedAuthEvent,
  request: AuthEventRequest,
): Promise<void> {
  try {
    await appendAuditLog({
      actorId: event.userId,
      action: event.action,
      entityType: "user",
      // The entity an auth event is "about" is the account itself — the one
      // signing in, or null when there is none to point at.
      entityId: event.userId,
      diff: null,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    });
  } catch (error) {
    console.error("[auth] failed to write auth event", { action: event.action, error });
  }
}
