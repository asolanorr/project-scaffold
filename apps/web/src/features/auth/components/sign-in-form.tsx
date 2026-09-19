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
  const returnTo = searchParams ? (await searchParams)[RETURN_TO_PARAM] : undefined;

  return (
    <AuthForm
      action={signInAction}
      submitLabel={t("submit")}
      // Not trusted here. The value reaches the browser, so it can be edited
      // before it comes back; the action runs it through safeReturnTo.
      returnTo={typeof returnTo === "string" ? returnTo : undefined}
      returnToName={RETURN_TO_PARAM}
    />
  );
}
