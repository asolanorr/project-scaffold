import type { BetterAuthOptions } from "@better-auth/core";
import { type EmailLocale, isEmailLocale, sendEmail, toEmailLocale } from "@repo/email";
import { env } from "@repo/env";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { decodeJwt } from "jose";
import { deferred } from "./defer";

/**
 * Everything about email in the auth flow, in one place: verification on
 * sign-up, password reset, the password-changed notice, single-use tokens and
 * the rate limit on the resend endpoint. `auth.ts` spreads these into its
 * options; the tests build a second instance from the same pieces.
 */

/** 24 hours: a sign-up link that arrives in the evening still works at breakfast. */
export const VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
/** 1 hour: a reset link is used at once or not at all. */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * The request's locale, sent by the app as a header on every auth call it
 * dispatches (see callAuthEndpoint). Validated against the locales mail can be
 * written in, so an arbitrary header value chooses nothing but English.
 */
export const LOCALE_HEADER = "x-app-locale";

type MailUser = { id: string; email: string; name: string; locale?: string | null };

/** Request locale first (what the user is looking at), then the account's. */
function requestLocale(request: Request | undefined, user: MailUser): EmailLocale {
  const header = request?.headers.get(LOCALE_HEADER);
  return isEmailLocale(header) ? header : toEmailLocale(user.locale);
}

/** Where a recipient goes if a change was not theirs: the forgot-password page, localized. */
function forgotPasswordUrl(locale: EmailLocale): string {
  const path = locale === "en" ? "/forgot-password" : `/${locale}/forgot-password`;
  return new URL(path, env.BETTER_AUTH_URL).toString();
}

// The user model gains a `locale`, set from the sign-up body and validated
// there — anything but a supported locale is rejected, not stored.
export const userLocaleField = {
  locale: {
    type: "string",
    required: false,
    defaultValue: "en",
    input: true,
    validator: {
      input: {
        "~standard": {
          version: 1,
          vendor: "scaffold",
          validate: (value: unknown) =>
            isEmailLocale(value)
              ? { value }
              : { issues: [{ message: `locale must be one of: en, es (got ${String(value)})` }] },
        },
      },
    },
  },
} as const;

export const emailVerificationOptions = {
  sendOnSignUp: true,
  // A sign-in attempt on an unverified account sends a fresh link. Knowing the
  // password is the gate, and the sign-in limit applies.
  sendOnSignIn: true,
  autoSignInAfterVerification: true,
  expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
  sendVerificationEmail: async (
    { user, url }: { user: MailUser; url: string },
    request?: Request,
  ) => {
    // Sign-up is the request that set the user's locale, so the two agree;
    // the header wins for a resend from a page in another language.
    const locale = requestLocale(request, user);
    deferred(() =>
      sendEmail({
        to: user.email,
        template: "verifyEmail",
        props: { name: user.name, url },
        locale,
      }),
    );
  },
} satisfies BetterAuthOptions["emailVerification"];

export const passwordOptions = {
  requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
  resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
  // Whoever held the old password held every session; a reset from a
  // stranger's device must not leave the stranger signed in.
  revokeSessionsOnPasswordReset: true,
  sendResetPassword: async ({ user, url }: { user: MailUser; url: string }, request?: Request) => {
    const locale = requestLocale(request, user);
    deferred(() =>
      sendEmail({
        to: user.email,
        template: "passwordReset",
        props: { name: user.name, url },
        locale,
      }),
    );
  },
  // Runs after a reset succeeded. The token used was consumed by Better Auth
  // and the others were removed by beforePasswordReset; what is left is to
  // tell the owner.
  onPasswordReset: async ({ user }: { user: MailUser }) => {
    notifyPasswordChanged(user);
  },
} satisfies Partial<NonNullable<BetterAuthOptions["emailAndPassword"]>>;

/**
 * The notice goes to the address on file, in the account's language — not the
 * request's. A stranger resetting the password from a Spanish browser does not
 * get to pick the language the owner is warned in.
 */
function notifyPasswordChanged(user: MailUser): void {
  const locale = toEmailLocale(user.locale);
  deferred(() =>
    sendEmail({
      to: user.email,
      template: "passwordChanged",
      props: { name: user.name, changedAt: new Date(), resetUrl: forgotPasswordUrl(locale) },
      locale,
    }),
  );
}

/**
 * Resend-verification gets its own, tighter limit. The general auth limit is
 * sized for someone using the app; this endpoint makes the app send mail to
 * any address on request, which makes it a way to spam third parties. The
 * same is true of a reset request, so it gets the same rule.
 */
export const emailRateLimitRules = {
  // Per IP and hour. Small, because one address behind a NAT is many
  // people only for sign-in; nobody legitimately asks for five verification
  // links or ten reset links in an hour.
  "/send-verification-email": { window: 60 * 60, max: 5 },
  "/request-password-reset": { window: 60 * 60, max: 10 },
} satisfies NonNullable<BetterAuthOptions["rateLimit"]>["customRules"];

/**
 * Verification tokens are signed JWTs, valid until they expire — so a link
 * can be replayed until then. This makes each one single-use: the token's
 * hash is reserved as a tombstone the first time it is presented, and a
 * second presentation finds the tombstone and is refused. Reset tokens need
 * none of this; Better Auth stores and consumes those atomically.
 */
export const singleUseVerificationTokens = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/verify-email") return;
  const token = ctx.query?.token;
  if (typeof token !== "string" || token.length === 0) return;

  const expiresAt = tokenExpiry(token);
  // Not a JWT at all: the endpoint will refuse it; nothing to reserve.
  if (!expiresAt) return;

  const identifier = `used-verification:${await sha256(token)}`;
  // Refused the way Better Auth refuses an expired link: back to the page the
  // link was meant to land on, with `?error=`, so the app can say what
  // happened. Only a same-origin path is followed; anything else gets JSON.
  const callbackURL = ctx.query?.callbackURL;
  const invalid = () =>
    typeof callbackURL === "string" && callbackURL.startsWith("/") && !callbackURL.startsWith("//")
      ? ctx.redirect(`${callbackURL}${callbackURL.includes("?") ? "&" : "?"}error=invalid_token`)
      : new APIError("BAD_REQUEST", { message: "invalid token", code: "INVALID_TOKEN" });

  // Two checks. The lookup is what a store without a primary-key constraint
  // (the in-memory adapter the tests use) can enforce; the reservation is the
  // atomic, first-writer-wins guard in Postgres, where two clicks racing
  // through the lookup still produce exactly one winner.
  if (await ctx.context.internalAdapter.findVerificationValue(identifier)) throw invalid();
  const fresh = await ctx.context.internalAdapter.reserveVerificationValue({
    identifier,
    value: "1",
    expiresAt,
  });
  if (!fresh) throw invalid();
});

/**
 * After a password change by a signed-in user: no outstanding reset link may
 * still work, and the owner is told. Runs as an `after` hook because Better
 * Auth has no callback for this path.
 */
export const afterPasswordChange = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/change-password" || isAPIError(ctx.context.returned)) return;
  const user = ctx.context.session?.user ?? ctx.context.newSession?.user;
  if (!user) return;

  await invalidateResetTokens(ctx.context.adapter, user.id);
  notifyPasswordChanged(user as MailUser);
});

/**
 * Before a reset is applied: every *other* outstanding reset token for the
 * same user is invalidated. Better Auth consumes the one being used; a second
 * link requested earlier would otherwise stay live for its remaining hour.
 * Done before rather than after because after the reset the used token's row
 * — the only handle on the user id in an unauthenticated request — is gone.
 */
export const beforePasswordReset = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/reset-password") return;
  const token = ctx.body?.token ?? ctx.query?.token;
  if (typeof token !== "string" || token.length === 0) return;

  const identifier = `reset-password:${token}`;
  const current = await ctx.context.internalAdapter.findVerificationValue(identifier);
  if (!current) return;

  await ctx.context.adapter.deleteMany({
    model: "verification",
    where: [
      { field: "identifier", value: "reset-password:", operator: "starts_with" },
      { field: "value", value: current.value, operator: "eq" },
      { field: "identifier", value: identifier, operator: "ne" },
    ],
  });
});

/** Every reset token a user has, gone — after a password change they know about. */
async function invalidateResetTokens(
  adapter: {
    deleteMany: (data: {
      model: string;
      where: Array<{ field: string; value: string; operator?: "starts_with" | "eq" | "ne" }>;
    }) => Promise<number>;
  },
  userId: string,
): Promise<void> {
  await adapter.deleteMany({
    model: "verification",
    where: [
      { field: "identifier", value: "reset-password:", operator: "starts_with" },
      { field: "value", value: userId, operator: "eq" },
    ],
  });
}

function tokenExpiry(token: string): Date | undefined {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? new Date(exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(bytes).toString("base64url");
}
