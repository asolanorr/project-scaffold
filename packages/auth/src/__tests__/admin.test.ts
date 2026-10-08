import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("../session", () => ({ getSession: () => getSessionMock() }));

// The real notFound() throws a framework control-flow error rather than
// returning. The stand-in throws too, so a test that forgets to expect it
// fails loudly instead of silently continuing past the guard.
class NotFoundError extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  },
}));

const { requireAdmin } = await import("../admin");

const adminSession = { session: { id: "s_1" }, user: { id: "u_1", role: "admin" } };
const userSession = { session: { id: "s_2" }, user: { id: "u_2", role: "user" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("returns the session for an admin", async () => {
    getSessionMock.mockResolvedValue(adminSession);

    await expect(requireAdmin()).resolves.toEqual(adminSession);
  });

  // Required case: a non-admin.
  it("404s a signed-in non-admin, not a 403", async () => {
    getSessionMock.mockResolvedValue(userSession);

    await expect(requireAdmin()).rejects.toBeInstanceOf(NotFoundError);
  });

  // Required case: a revoked admin. requireAdmin has no memory of a past
  // role — it checks whatever `getSession()` returns right now, which is
  // exactly what makes a revocation take effect on the very next request
  // rather than needing a cache to be invalidated somewhere.
  it("404s a user whose admin role has since been revoked", async () => {
    getSessionMock.mockResolvedValue(userSession);

    await expect(requireAdmin()).rejects.toBeInstanceOf(NotFoundError);
  });

  // Required case, implicitly: a non-admin gets not-found, not a login
  // prompt — including a visitor with no session at all. Redirecting a
  // signed-out visitor to sign-in would itself be the login prompt this
  // must never show.
  it("404s a signed-out visitor rather than redirecting to sign-in", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toBeInstanceOf(NotFoundError);
  });
});
