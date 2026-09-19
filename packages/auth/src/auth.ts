import { db } from "@repo/db";
import { env } from "@repo/env";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
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

  emailAndPassword: {
    enabled: true,
    // Off so that a fresh clone can sign up before Resend is configured — with
    // this on and no email transport, the first account created is also the
    // first account permanently locked out. Turn it on in the same change that
    // adds RESEND_API_KEY and the verification email template; leaving it off
    // past that point means an unverified address can hold an account.
    requireEmailVerification: false,
  },

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

  hooks: { after: recordAuthEvent },

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
