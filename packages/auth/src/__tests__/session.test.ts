import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const headersMock = vi.fn();

vi.mock("../auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

// The real redirect() throws a framework control-flow error rather than
// returning. The stand-in throws too, so a test that forgets to expect it
// fails loudly instead of silently continuing past the guard.
class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const { getSession, requireSession, SIGN_IN_PATH } = await import("../session");

const requestHeaders = new Headers({ cookie: "better-auth.session_token=abc" });
const session = { session: { id: "s_1" }, user: { id: "u_1", email: "a@example.com" } };

beforeEach(() => {
  vi.clearAllMocks();
  headersMock.mockResolvedValue(requestHeaders);
});

describe("requireSession", () => {
  it("returns the session for an authenticated request", async () => {
    getSessionMock.mockResolvedValue(session);

    await expect(requireSession()).resolves.toEqual(session);
  });

  it("passes the incoming request headers through to Better Auth", async () => {
    getSessionMock.mockResolvedValue(session);

    await requireSession();

    expect(getSessionMock).toHaveBeenCalledWith({ headers: requestHeaders });
  });

  it("redirects to the sign-in page when there is no session", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow(RedirectError);
    await expect(requireSession()).rejects.toMatchObject({ to: SIGN_IN_PATH });
  });

  // The redirect is a thrown control-flow error. If requireSession ever
  // returned normally on a signed-out request, every caller downstream would
  // treat the request as authenticated.
  it("never resolves to a null session", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await requireSession().catch((error) => error);

    expect(result).toBeInstanceOf(RedirectError);
  });

  it("does not swallow an error from the session lookup", async () => {
    getSessionMock.mockRejectedValue(new Error("database unreachable"));

    await expect(requireSession()).rejects.toThrow("database unreachable");
  });
});

describe("getSession", () => {
  it("returns null instead of redirecting when signed out", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the session when signed in", async () => {
    getSessionMock.mockResolvedValue(session);

    await expect(getSession()).resolves.toEqual(session);
  });
});
