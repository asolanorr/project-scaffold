import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations } from "next-intl/server";
import { FORGOT_PASSWORD_PATH } from "@/lib/routes";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * Better Auth's `/reset-password/:token` endpoint checks the token exists and
 * redirects here with `?token=`. No token — someone opened the page directly,
 * or the link was cut — means there is nothing to submit.
 */
export async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("auth.resetPassword");
  const tErrors = await getTranslations("auth.errors");
  const params = await searchParams;
  const token =
    typeof params.token === "string" && params.token.length > 0 ? params.token : undefined;
  // The callback endpoint found the token used or expired and came back with
  // `?error=`; a page opened with no token at all is the other case.
  const invalid = typeof params.error === "string";

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-md text-tertiary" role="alert">
          {invalid ? tErrors("invalidToken") : t("missingToken")}
        </p>
        <Button color="secondary" href={FORGOT_PASSWORD_PATH}>
          {t("requestNew")}
        </Button>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
