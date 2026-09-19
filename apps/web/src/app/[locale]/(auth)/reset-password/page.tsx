import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ResetPassword } from "@/features/auth/components/reset-password";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/constants";
import { resolveLocale } from "@/lib/locale";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("auth.resetPassword");

  return (
    <>
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-display-sm font-semibold text-primary">{t("title")}</h1>
        <p className="text-md text-tertiary">{t("subtitle", { min: MIN_PASSWORD_LENGTH })}</p>
      </header>

      {/* The token is a query parameter — request data — so the form waits. */}
      <Suspense fallback={null}>
        <ResetPassword searchParams={searchParams} />
      </Suspense>
    </>
  );
}
