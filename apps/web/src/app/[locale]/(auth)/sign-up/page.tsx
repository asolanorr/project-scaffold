import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { signUpAction } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { resolveLocale } from "@/lib/locale";

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("auth.signUp");

  return (
    <>
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-display-sm font-semibold text-primary">{t("title")}</h1>
        <p className="text-md text-tertiary">{t("subtitle")}</p>
      </header>

      <AuthForm action={signUpAction} submitLabel={t("submit")} withName />

      <p className="text-center text-sm text-tertiary">
        {t("haveAccount")}{" "}
        <Button color="link-color" size="md" href="/sign-in">
          {t("signInInstead")}
        </Button>
      </p>
    </>
  );
}
