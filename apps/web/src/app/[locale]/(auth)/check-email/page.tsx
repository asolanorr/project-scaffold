import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CheckEmailNotice } from "@/features/auth/components/check-email-notice";
import { resolveLocale } from "@/lib/locale";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function CheckEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("auth.checkEmail");

  return (
    <>
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-display-sm font-semibold text-primary">{t("title")}</h1>
      </header>

      {/* The address is a query parameter — request data — so it waits. */}
      <Suspense
        fallback={<p className="text-center text-md text-tertiary">{t("subtitleNoEmail")}</p>}
      >
        <CheckEmailNotice searchParams={searchParams} />
      </Suspense>

      <p className="text-center text-sm text-tertiary">
        <Button color="link-gray" size="md" href={SIGN_IN_PATH}>
          {t("backToSignIn")}
        </Button>
      </p>
    </>
  );
}
