import { getTranslations } from "next-intl/server";
import { RETURN_TO_PARAM } from "@/lib/routes";
import { signInAction } from "../actions";
import { AuthForm } from "./auth-form";

export type SignInFormProps = {
  /**
   * Omitted when rendered as the Suspense fallback, so the same markup
   * prerenders and then resolves with the hidden field filled in — no second
   * component to keep in step, and no layout shift.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function SignInForm({ searchParams }: SignInFormProps) {
  const t = await getTranslations("auth.signIn");
  const tErrors = await getTranslations("auth.errors");
  const params = searchParams ? await searchParams : {};
  const returnTo = params[RETURN_TO_PARAM];
  // Better Auth sends a failed verification link back to its callbackURL with
  // `?error=...`. Signed out, the dashboard bounced that here — with the
  // whole URL, error included, in the `next` parameter. Say what happened.
  const verificationFailed =
    typeof params.error === "string" ||
    (typeof returnTo === "string" && returnTo.includes("error=invalid_token"));

  return (
    <>
      {verificationFailed ? (
        <p className="text-center text-sm text-error-primary" role="alert">
          {tErrors("verificationFailed")}
        </p>
      ) : null}
      <AuthForm
        action={signInAction}
        submitLabel={t("submit")}
        // Not trusted here. The value reaches the browser, so it can be edited
        // before it comes back; the action runs it through safeReturnTo.
        returnTo={typeof returnTo === "string" ? returnTo : undefined}
        returnToName={RETURN_TO_PARAM}
      />
    </>
  );
}
