import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { resolveLocale } from "@/lib/locale";

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("auth.signIn");

  return (
    <>
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-display-sm font-semibold text-primary">{t("title")}</h1>
        <p className="text-md text-tertiary">{t("subtitle")}</p>
      </header>

      {/* Everything outside this boundary prerenders. Only the form waits,
          because the `next` query parameter is request data. The fallback is
          the same component without searchParams, so the markup matches. */}
      <Suspense fallback={<SignInForm />}>
        <SignInForm searchParams={searchParams} />
      </Suspense>

      <p className="text-center text-sm text-tertiary">
        {t("noAccount")}{" "}
        <Button color="link-color" size="md" href="/sign-up">
          {t("createOne")}
        </Button>
      </p>
    </>
  );
}
