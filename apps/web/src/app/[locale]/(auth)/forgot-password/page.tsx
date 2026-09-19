import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { resolveLocale } from "@/lib/locale";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("auth.forgotPassword");

  return (
    <>
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-display-sm font-semibold text-primary">{t("title")}</h1>
        <p className="text-md text-tertiary">{t("subtitle")}</p>
      </header>

      <ForgotPasswordForm />

      <p className="text-center text-sm text-tertiary">
        <Button color="link-gray" size="md" href={SIGN_IN_PATH}>
          {t("backToSignIn")}
        </Button>
      </p>
    </>
  );
}
