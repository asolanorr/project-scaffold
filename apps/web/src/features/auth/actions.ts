"use server";

import { callAuthEndpoint } from "@repo/auth";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/action-state";
import { parseFormData } from "@/lib/form";
import { AFTER_SIGN_IN_PATH, RETURN_TO_PARAM } from "@/lib/routes";
import type { AuthErrorCode } from "./constants";
import { safeReturnTo, signInSchema, signUpSchema } from "./schema";

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
  const response = await callAuthEndpoint("/sign-in/email", parsed.data);
  if (!response.ok) {
    return { ok: false, code: await toErrorCode(response, "invalidCredentials") };
  }

  // 5. invalidate — nothing is cached for a user who was signed out.
  // 6. respond
  const locale = await getLocale();
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

  const response = await callAuthEndpoint("/sign-up/email", parsed.data);
  if (!response.ok) {
    return { ok: false, code: await toErrorCode(response, "emailTaken") };
  }

  const locale = await getLocale();
  redirect({ href: AFTER_SIGN_IN_PATH, locale });
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
