import { db } from "@repo/db";
import { deploymentOrigins, env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { userRoleField } from "./admin";
import {
  afterPasswordChange,
  beforePasswordReset,
  emailRateLimitRules,
  emailVerificationOptions,
  passwordOptions,
  singleUseVerificationTokens,
  userLocaleField,
} from "./email-flows";
import { recordAuthEvent } from "./event-hook";

const isHttps = env.BETTER_AUTH_URL.startsWith("https://");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // The schema in @repo/db names tables plurally (`users`, `sessions`),
    // matching every application table. Better Auth's models are singular, so
    // it has to be told how to reach them.
    usePlural: true,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // A preview is reachable on its unique deployment URL and on its branch
  // alias; production on its domain and its *.vercel.app name. The origin
  // check accepts a request from any of them and nothing else.
  trustedOrigins: deploymentOrigins(),

  emailAndPassword: {
    enabled: true,
    // Verification, reset, the password-changed notice, token lifetimes: all
    // in ./email-flows, with the tests that drive them.
    ...passwordOptions,
  },
  emailVerification: emailVerificationOptions,

  user: { additionalFields: { ...userLocaleField, ...userRoleField } },

  // storage must be "database". The default is per-instance memory, which on
  // serverless means each cold start begins with an empty counter — that is not
  // a weaker limit, it is no limit at all.
  //
  // No `modelName` here, deliberately. `usePlural` already resolves the
  // rateLimit model to the `rateLimits` export; naming it explicitly as well
  // makes Better Auth pluralise the override too and look for `rateLimitss`,
  // which typechecks and then throws on the first rate-limited request. There
  // is a test pinning that in __tests__/schema-contract.test.ts.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    storage: "database",
    // Endpoints that make the app send mail to an arbitrary address get a
    // tighter limit of their own; see ./email-flows.
    customRules: emailRateLimitRules,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      // Derived rather than hardcoded: `secure: true` over plain-http localhost
      // means the browser drops the cookie and sign-in appears to do nothing.
      secure: isHttps,
    },
  },

  // One hook per phase, so each is composed here. Wrapped in
  // createAuthMiddleware: the router reads headers off a hook's return value,
  // and a bare async function returning undefined crashes it.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      await singleUseVerificationTokens(ctx);
      await beforePasswordReset(ctx);
    }),
    after: createAuthMiddleware(async (ctx) => {
      await recordAuthEvent(ctx);
      await afterPasswordChange(ctx);
    }),
  },

  // Must stay last in the list. It makes `getSession()` behave inside a Server
  // Component: a read there can fall due for a session refresh, and an RSC
  // cannot write cookies, so without this the row is refreshed in the database
  // while the browser keeps the old cookie. The plugin detects that context and
  // skips the refresh instead. It stands down for requests dispatched through
  // `auth.handler` — see callAuthEndpoint in ./next.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
