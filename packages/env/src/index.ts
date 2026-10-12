import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
// Loads the repository-root .env, if there is one. See ./load for why this is
// a separate module: drizzle.config.ts needs the loading without the
// validation below.
import "./load.ts";

// Single source of truth for environment variables. Every package and app
// that needs one imports it from here instead of reading `process.env`
// directly — @repo/db, @repo/auth and apps/web all add their own required
// keys to these two schemas as those pieces are built.
export const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  server: {
    // Pooled connection (Supabase port 6543, transaction mode) — used by the
    // application at runtime. See ARCHITECTURE.md §4, "On Supabase specifically".
    DATABASE_URL: z.url(),
    // Direct connection (port 5432) — used by drizzle-kit for migrations only.
    DIRECT_URL: z.url(),

    // Signing key for session tokens and every other Better Auth secret. 32
    // bytes minimum because it is the input to the HMAC — generate one with
    // `openssl rand -base64 32`. Rotating it invalidates every live session.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public origin the app is served from. Better Auth builds callback URLs
    // from it and validates the request origin against it, so a wrong value
    // fails closed rather than silently allowing a cross-origin sign-in.
    // On Vercel it defaults to the deployment's own URL (see runtimeEnv), so
    // previews need nothing set; production sets it to the real domain.
    BETTER_AUTH_URL: z.url(),

    // Vercel's system variables, present only there. Read so the origins a
    // deployment answers on — the unique deployment URL, the branch alias,
    // the production domain — can be trusted without listing them by hand.
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_BRANCH_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

    // Transactional email. Without a key nothing is sent: in development the
    // console transport prints each message (with its links) instead, which is
    // how a local sign-up gets verified. Production must have a key — see
    // the refinement below.
    RESEND_API_KEY: z.string().min(1).optional(),
    // The From header, RFC 5322: `Name <address@verified-domain>`. The domain
    // has to be verified in Resend or every send is rejected.
    EMAIL_FROM: z.string().min(3).default("Scaffold <onboarding@resend.dev>"),
    // Sign-up requires a verified address before a session is issued. Off is a
    // documented escape hatch for previews and demos without a mail provider;
    // never off in production.
    REQUIRE_EMAIL_VERIFICATION: z.stringbool().default(true),

    // Supabase project URL (`https://<ref>.supabase.co`) and the service role
    // key, used by @repo/storage to mint signed upload URLs and to read
    // object metadata. The service role bypasses Row Level Security — never
    // send it to the browser; everything the client gets is a signed URL for
    // one object, scoped and time-limited. Optional outside production: local
    // development and CI run without Supabase Storage and use the fake
    // provider from @repo/storage/testing instead.
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Stripe, used by @repo/payments. The secret key creates Checkout
    // Sessions; the webhook secret verifies the signature on every event
    // before a byte of its body is trusted. Optional outside production:
    // local development and CI run without Stripe and use the fake provider
    // from @repo/payments/testing instead.
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),

    // Shared secret Vercel Cron sends as `Authorization: Bearer $CRON_SECRET`
    // when it invokes a job route. Self-generated, no external account — like
    // BETTER_AUTH_SECRET, required everywhere rather than production-only, so
    // a job route can never be deployed reachable with no check at all.
    CRON_SECRET: z.string().min(16),

    // Sentry project DSN. Optional outside production: a job failure always
    // logs to the console either way (see apps/web/src/jobs/run-job.ts) —
    // this only adds the alert.
    SENTRY_DSN: z.url().optional(),

    // CSP_REPORT_ONLY is deliberately not here — it is read by the middleware,
    // which runs on the edge and must not import this schema. See ./edge.
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    // `||`, not `??`: an empty value in a dashboard means "not set" too.
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || vercelOrigin(),
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

// Production without a mail provider would accept sign-ups nobody can ever
// verify. Refuse to boot instead; the message names the variable.
if (env.VERCEL_ENV === "production" && !env.RESEND_API_KEY && !process.env.SKIP_ENV_VALIDATION) {
  throw new Error("RESEND_API_KEY is required in production: sign-up sends verification email.");
}
if (
  env.VERCEL_ENV === "production" &&
  (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) &&
  !process.env.SKIP_ENV_VALIDATION
) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production: file uploads need them.",
  );
}
if (
  env.VERCEL_ENV === "production" &&
  (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) &&
  !process.env.SKIP_ENV_VALIDATION
) {
  throw new Error(
    "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in production: checkout and its webhook need them.",
  );
}
if (env.VERCEL_ENV === "production" && !env.SENTRY_DSN && !process.env.SKIP_ENV_VALIDATION) {
  throw new Error(
    "SENTRY_DSN is required in production: a job failure must raise an alert, not just a log line.",
  );
}

/**
 * The origin Vercel serves this deployment from, when running there.
 *
 * Production: the project's production domain. Preview: the branch alias,
 * which stays the same across pushes to the branch, so a session survives a
 * redeploy. Only a default — an explicit BETTER_AUTH_URL wins, and a custom
 * production domain must set it, because Vercel reports the `*.vercel.app`
 * name there, not the domain in front of it.
 */
function vercelOrigin(): string | undefined {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

/**
 * Every origin this deployment may legitimately be reached on.
 *
 * On Vercel a preview answers on its unique deployment URL and on the branch
 * alias; production on its domain and on the `*.vercel.app` name. A request
 * arriving on any of them is a first-party request. Better Auth's origin check
 * and Next's Server Action origin check both take this list — the same list,
 * so the two cannot drift.
 */
export function deploymentOrigins(): string[] {
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL];
  const origins = new Set<string>([env.BETTER_AUTH_URL]);
  for (const host of hosts) if (host) origins.add(`https://${host}`);
  return [...origins];
}
