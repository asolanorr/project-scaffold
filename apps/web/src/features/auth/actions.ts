"use server";

import { callAuthEndpoint } from "@repo/auth";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/routing";
import type { ActionState } from "@/lib/action-state";
import { parseFormData } from "@/lib/form";
import {
  AFTER_SIGN_IN_PATH,
  CHECK_EMAIL_PATH,
  RESET_PASSWORD_PATH,
  RETURN_TO_PARAM,
} from "@/lib/routes";
import type { AuthErrorCode } from "./constants";
import {
  emailOnlySchema,
  resetPasswordSchema,
  safeReturnTo,
  signInSchema,
  signUpSchema,
} from "./schema";

type AuthActionState = ActionState<undefined, AuthErrorCode>;

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  // 1. authenticate — not applicable; this is the endpoint that authenticates.

  // 2. validate
  const input = parseFormData(formData);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 3. authorize — Better Auth owns the credential check.
  // 4. execute
  const locale = await getLocale();
  const response = await callAuthEndpoint("/sign-in/email", parsed.data, { locale });
  if (response.status === 403) {
    // Right password, unverified address. Better Auth has just sent a fresh
    // link (sendOnSignIn); send the user to the page that says so.
    redirect({ href: { pathname: CHECK_EMAIL_PATH, query: { email: parsed.data.email } }, locale });
  }
  if (!response.ok) {
    return { ok: false, code: await toErrorCode(response, "invalidCredentials") };
  }

  // 5. invalidate — nothing is cached for a user who was signed out.
  // 6. respond
  redirect({
    href: safeReturnTo(input[RETURN_TO_PARAM], AFTER_SIGN_IN_PATH),
    locale,
  });
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = parseFormData(formData);
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const locale = await getLocale();
  const response = await callAuthEndpoint(
    "/sign-up/email",
    {
      ...parsed.data,
      // Stored on the account: the language its mail is written in.
      locale,
      // Where the verification link lands — signed in, on the dashboard, in
      // this language.
      callbackURL: localizedPath(locale, AFTER_SIGN_IN_PATH),
    },
    { locale },
  );
  if (!response.ok) {
    return { ok: false, code: await toErrorCode(response, "emailTaken") };
  }

  // With verification required there is no session yet. When it is off
  // (a preview), Better Auth signed the user in and the dashboard is next.
  const body = (await response.json()) as { token: string | null };
  redirect({
    href: body.token
      ? AFTER_SIGN_IN_PATH
      : { pathname: CHECK_EMAIL_PATH, query: { email: parsed.data.email } },
    locale,
  });
}

/**
 * Send the verification link again. The endpoint has its own rate limit; a
 * 429 is the one failure worth distinguishing.
 */
export async function resendVerificationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const locale = await getLocale();
  const response = await callAuthEndpoint(
    "/send-verification-email",
    { email: parsed.data.email, callbackURL: localizedPath(locale, AFTER_SIGN_IN_PATH) },
    { locale },
  );
  if (!response.ok) return { ok: false, code: await toErrorCode(response, "unexpected") };
  return { ok: true, data: undefined };
}

/**
 * Request a reset link. Succeeds whether or not the address has an account —
 * Better Auth answers the same either way, and so does this, because the
 * difference is a list of who has signed up.
 */
export async function forgotPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const locale = await getLocale();
  const response = await callAuthEndpoint(
    "/request-password-reset",
    { email: parsed.data.email, redirectTo: localizedPath(locale, RESET_PASSWORD_PATH) },
    { locale },
  );
  if (!response.ok) return { ok: false, code: await toErrorCode(response, "unexpected") };
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const locale = await getLocale();
  const response = await callAuthEndpoint(
    "/reset-password",
    { token: parsed.data.token, newPassword: parsed.data.password },
    { locale },
  );
  // Used, expired, or never issued: one answer, and a new link is the way out.
  if (!response.ok) return { ok: false, code: await toErrorCode(response, "invalidToken") };
  return { ok: true, data: undefined };
}

export async function signOutAction(): Promise<void> {
  await callAuthEndpoint("/sign-out", {});
  const locale = await getLocale();
  redirect({ href: "/", locale });
}

/**
 * Collapse Better Auth's response into one of a handful of codes.
 *
 * The body is read and discarded on purpose. Better Auth distinguishes "no such
 * user" from "wrong password", and passing that distinction to the browser
 * turns the sign-in form into an oracle for which addresses hold accounts. The
 * response is identical either way, and the detail that an investigation needs
 * is in the auth event log instead.
 */
async function toErrorCode(response: Response, fallback: AuthErrorCode): Promise<AuthErrorCode> {
  if (response.status === 429) return "tooManyRequests";
  // 4xx is a rejected credential or a rejected email; 5xx is our problem, and
  // saying "those details do not match" would be a lie that costs a support
  // ticket.
  return response.status >= 500 ? "unexpected" : fallback;
}
