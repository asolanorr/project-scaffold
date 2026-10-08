import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLogMock = vi.fn();

vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/db")>()),
  appendAuditLog: (entry: unknown) => appendAuditLogMock(entry),
}));

const { logAuthEvent, resolveAuthEvent } = await import("../events");

const request = { ipAddress: "203.0.113.7", userAgent: "Mozilla/5.0" };

beforeEach(() => {
  vi.clearAllMocks();
  appendAuditLogMock.mockResolvedValue(undefined);
});

describe("resolveAuthEvent", () => {
  it("records a successful sign-in against the new session's user", () => {
    expect(
      resolveAuthEvent({ path: "/sign-in/email", didFail: false, newSessionUserId: "u_1" }),
    ).toEqual({ action: "auth.sign_in", userId: "u_1" });
  });

  it("records a failed sign-in", () => {
    expect(resolveAuthEvent({ path: "/sign-in/email", didFail: true })).toEqual({
      action: "auth.sign_in_failed",
      userId: null,
    });
  });

  // Resolving the id would mean an existence check on every failed attempt.
  // The sign-in response is careful not to reveal whether an account exists;
  // the audit log must not undo that from the other side.
  it("does not attach a user id to a failed sign-in", () => {
    const event = resolveAuthEvent({
      path: "/sign-in/email",
      didFail: true,
      sessionUserId: "u_1",
      newSessionUserId: "u_1",
    });

    expect(event?.userId).toBeNull();
  });

  it("records a password change against the session's user", () => {
    expect(
      resolveAuthEvent({ path: "/change-password", didFail: false, sessionUserId: "u_1" }),
    ).toEqual({ action: "auth.password_change", userId: "u_1" });
  });

  // A rejected password change is a wrong current password, which is not the
  // event this log is for, and there is no failure mapping for that path.
  it("ignores a failed password change", () => {
    expect(
      resolveAuthEvent({ path: "/change-password", didFail: true, sessionUserId: "u_1" }),
    ).toBeNull();
  });

  it("ignores paths that are not security events", () => {
    expect(resolveAuthEvent({ path: "/get-session", didFail: false })).toBeNull();
    expect(resolveAuthEvent({ path: "/sign-out", didFail: false })).toBeNull();
    expect(resolveAuthEvent({ path: "/sign-up/email", didFail: false })).toBeNull();
  });

  it("prefers the new session over an existing one", () => {
    expect(
      resolveAuthEvent({
        path: "/sign-in/email",
        didFail: false,
        newSessionUserId: "u_new",
        sessionUserId: "u_old",
      })?.userId,
    ).toBe("u_new");
  });

  it("resolves a null user id rather than failing when neither session is present", () => {
    expect(resolveAuthEvent({ path: "/sign-in/email", didFail: false })).toEqual({
      action: "auth.sign_in",
      userId: null,
    });
  });
});

describe("logAuthEvent", () => {
  it("writes the event with the request's IP and user agent", async () => {
    await logAuthEvent({ action: "auth.sign_in", userId: "u_1" }, request);

    expect(appendAuditLogMock).toHaveBeenCalledWith({
      actorId: "u_1",
      action: "auth.sign_in",
      entityType: "user",
      entityId: "u_1",
      diff: null,
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });
  });

  it("writes an event with no user id", async () => {
    await logAuthEvent({ action: "auth.sign_in_failed", userId: null }, request);

    expect(appendAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, entityId: null }),
    );
  });

  // This runs inside Better Auth's after-hook, where throwing would surface to
  // the caller as a failed request. Refusing to sign in a legitimate user
  // because an audit insert timed out is the wrong trade.
  it("swallows a write failure rather than failing the request", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    appendAuditLogMock.mockRejectedValue(new Error("connection pool exhausted"));

    await expect(
      logAuthEvent({ action: "auth.sign_in", userId: "u_1" }, request),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
