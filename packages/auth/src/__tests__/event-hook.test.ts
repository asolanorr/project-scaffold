import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logAuthEventMock = vi.fn();

vi.mock("../events", async (importOriginal) => ({
  // resolveAuthEvent stays real — this exercises the whole path from Better
  // Auth's request context through the mapping. Only the insert is replaced.
  ...(await importOriginal<typeof import("../events")>()),
  logAuthEvent: (...args: unknown[]) => logAuthEventMock(...args),
}));

const { recordAuthEvent } = await import("../event-hook");

// A second Better Auth instance over an in-memory store. The point is to drive
// the hook through a genuine request pipeline: `ctx.path`, the APIError that a
// failed sign-in leaves in `context.returned`, and where the user id lives on
// success are all library behaviour, and asserting them against a hand-built
// fake context would only prove the fake matches itself.
const auth = betterAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  secret: "test-secret-at-least-thirty-two-characters",
  baseURL: "http://localhost:3000",
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  hooks: { after: recordAuthEvent },
});

const credentials = { email: "ada@example.com", password: "correct-horse-battery" };

const headers = () =>
  new Headers({ "user-agent": "Mozilla/5.0 (test)", "x-forwarded-for": "203.0.113.7" });

const eventsOfAction = (action: string) =>
  logAuthEventMock.mock.calls.filter(([event]) => event.action === action);

let userId: string;

beforeEach(async () => {
  logAuthEventMock.mockClear();
});

describe("recordAuthEvent", () => {
  it("records nothing for sign-up", async () => {
    const result = await auth.api.signUpEmail({
      body: { ...credentials, name: "Ada" },
      headers: headers(),
    });
    userId = result.user.id;

    expect(logAuthEventMock).not.toHaveBeenCalled();
  });

  it("records a successful sign-in against the signed-in user", async () => {
    await auth.api.signInEmail({ body: credentials, headers: headers(), asResponse: true });

    expect(eventsOfAction("auth.sign_in")).toHaveLength(1);
    expect(eventsOfAction("auth.sign_in")[0]?.[0]).toEqual({ action: "auth.sign_in", userId });
  });

  it("captures the IP and user agent from the request", async () => {
    await auth.api.signInEmail({ body: credentials, headers: headers(), asResponse: true });

    expect(eventsOfAction("auth.sign_in")[0]?.[1]).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 (test)",
    });
  });

  // The reason the hook reads `context.returned` rather than assuming success:
  // a rejected sign-in still reaches the after-hook, carrying an APIError.
  it("records a failed sign-in when the password is wrong", async () => {
    await expect(
      auth.api.signInEmail({
        body: { ...credentials, password: "wrong-password" },
        headers: headers(),
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(eventsOfAction("auth.sign_in")).toHaveLength(0);
    expect(eventsOfAction("auth.sign_in_failed")).toHaveLength(1);
    expect(eventsOfAction("auth.sign_in_failed")[0]?.[0]).toEqual({
      action: "auth.sign_in_failed",
      userId: null,
    });
  });

  it("records a failed sign-in for an address with no account", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: "nobody@example.com", password: "whatever-password" },
        headers: headers(),
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(eventsOfAction("auth.sign_in_failed")).toHaveLength(1);
    expect(eventsOfAction("auth.sign_in_failed")[0]?.[1]).toMatchObject({
      ipAddress: "203.0.113.7",
    });
  });

  it("records a password change against the session's user", async () => {
    const signIn = await auth.api.signInEmail({
      body: credentials,
      headers: headers(),
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";
    logAuthEventMock.mockClear();

    const authed = headers();
    authed.set("cookie", cookie);
    await auth.api.changePassword({
      body: { currentPassword: credentials.password, newPassword: "an-entirely-new-password" },
      headers: authed,
    });

    expect(eventsOfAction("auth.password_change")).toHaveLength(1);
    expect(eventsOfAction("auth.password_change")[0]?.[0]).toEqual({
      action: "auth.password_change",
      userId,
    });
  });

  it("records nothing for reading the session", async () => {
    await auth.api.getSession({ headers: headers() });

    expect(logAuthEventMock).not.toHaveBeenCalled();
  });
});
