import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The schema validates at import, so each case sets the environment first
// and then imports a fresh copy of the module.
const base = {
  DATABASE_URL: "postgres://test:test@localhost:6543/test",
  DIRECT_URL: "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
};

async function load(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of [
    "BETTER_AUTH_URL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ]) {
    vi.stubEnv(key, "");
  }
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value !== undefined) vi.stubEnv(key, value);
  }
  return import("../index");
}

beforeEach(() => {
  vi.stubEnv("SKIP_ENV_VALIDATION", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BETTER_AUTH_URL on Vercel", () => {
  it("is the branch alias on a preview when not set explicitly", async () => {
    const { env } = await load({
      VERCEL_ENV: "preview",
      VERCEL_URL: "web-abc123-team.vercel.app",
      VERCEL_BRANCH_URL: "web-git-feature-team.vercel.app",
    });

    expect(env.BETTER_AUTH_URL).toBe("https://web-git-feature-team.vercel.app");
  });

  it("is the production domain Vercel reports on production", async () => {
    const { env } = await load({
      VERCEL_ENV: "production",
      VERCEL_URL: "web-abc123-team.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
    });

    expect(env.BETTER_AUTH_URL).toBe("https://web.vercel.app");
  });

  it("is never overridden when set explicitly", async () => {
    const { env } = await load({
      BETTER_AUTH_URL: "https://app.example.com",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
    });

    expect(env.BETTER_AUTH_URL).toBe("https://app.example.com");
  });

  it("is required off Vercel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(load({})).rejects.toThrow("Invalid environment variables");
  });
});

describe("deploymentOrigins", () => {
  it("lists the explicit origin plus every Vercel host, once each", async () => {
    const { deploymentOrigins } = await load({
      BETTER_AUTH_URL: "https://app.example.com",
      VERCEL_ENV: "production",
      VERCEL_URL: "web-abc123-team.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
    });

    expect(deploymentOrigins()).toEqual([
      "https://app.example.com",
      "https://web-abc123-team.vercel.app",
      "https://web.vercel.app",
    ]);
  });

  it("is just the configured origin off Vercel", async () => {
    const { deploymentOrigins } = await load({ BETTER_AUTH_URL: "http://localhost:3000" });

    expect(deploymentOrigins()).toEqual(["http://localhost:3000"]);
  });
});
