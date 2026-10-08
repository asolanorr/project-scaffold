import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The schema validates at import, so each case sets the environment first
// and then imports a fresh copy of the module.
const base = {
  DATABASE_URL: "postgres://test:test@localhost:6543/test",
  DIRECT_URL: "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
  // Required unconditionally, like BETTER_AUTH_SECRET — not one of the
  // optional-but-production-required secrets below.
  CRON_SECRET: "test-secret-at-least-sixteen-characters",
};

// Every optional-but-production-required secret, satisfied — so a test
// about something else (origins, BETTER_AUTH_URL) does not also have to
// know about each one individually to reach "production" without throwing.
const productionSecrets = {
  RESEND_API_KEY: "re_test",
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
};

async function load(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of [
    "BETTER_AUTH_URL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "RESEND_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SENTRY_DSN",
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
      ...productionSecrets,
    });

    expect(env.BETTER_AUTH_URL).toBe("https://web.vercel.app");
  });

  it("is never overridden when set explicitly", async () => {
    const { env } = await load({
      BETTER_AUTH_URL: "https://app.example.com",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
      ...productionSecrets,
    });

    expect(env.BETTER_AUTH_URL).toBe("https://app.example.com");
  });

  it("is required off Vercel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(load({})).rejects.toThrow("Invalid environment variables");
  });
});

describe("RESEND_API_KEY", () => {
  it("is required in production, because sign-up sends mail", async () => {
    await expect(
      load({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app" }),
    ).rejects.toThrow("RESEND_API_KEY is required in production");
  });

  it("is optional everywhere else", async () => {
    const { env } = await load({ VERCEL_ENV: "preview", VERCEL_URL: "web-abc.vercel.app" });

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });
});

describe("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", () => {
  it("are required together in production, because file uploads need both", async () => {
    await expect(
      load({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
        RESEND_API_KEY: "re_test",
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
      }),
    ).rejects.toThrow("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production");
  });

  it("are optional everywhere else", async () => {
    const { env } = await load({ VERCEL_ENV: "preview", VERCEL_URL: "web-abc.vercel.app" });

    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});

describe("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET", () => {
  it("are required together in production, because checkout and its webhook need both", async () => {
    await expect(
      load({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
        RESEND_API_KEY: "re_test",
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).rejects.toThrow("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production");
  });

  it("are optional everywhere else", async () => {
    const { env } = await load({ VERCEL_ENV: "preview", VERCEL_URL: "web-abc.vercel.app" });

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
  });
});

describe("CRON_SECRET", () => {
  it("is required everywhere, not just in production", async () => {
    await expect(load({ CRON_SECRET: "" })).rejects.toThrow("Invalid environment variables");
  });
});

describe("SENTRY_DSN", () => {
  it("is required in production, because a job failure must raise an alert", async () => {
    await expect(
      load({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
        RESEND_API_KEY: "re_test",
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
      }),
    ).rejects.toThrow("SENTRY_DSN is required in production");
  });

  it("is optional everywhere else", async () => {
    const { env } = await load({ VERCEL_ENV: "preview", VERCEL_URL: "web-abc.vercel.app" });

    expect(env.SENTRY_DSN).toBeUndefined();
  });
});

describe("deploymentOrigins", () => {
  it("lists the explicit origin plus every Vercel host, once each", async () => {
    const { deploymentOrigins } = await load({
      BETTER_AUTH_URL: "https://app.example.com",
      VERCEL_ENV: "production",
      VERCEL_URL: "web-abc123-team.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "web.vercel.app",
      ...productionSecrets,
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
