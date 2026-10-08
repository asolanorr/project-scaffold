import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveLocale } from "@/lib/locale";
import { SIGN_IN_PATH } from "@/lib/routes";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("marketing");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col items-start gap-6 px-4 py-12 md:px-8">
      <h1 className="text-display-md font-semibold text-primary">{t("title")}</h1>
      <p className="max-w-prose text-lg text-tertiary">{t("description")}</p>
      {/* A React Aria link: the RouterProvider in the layout routes it through
          next-intl, so the locale prefix is kept and the click is client-side. */}
      <Button size="lg" href={SIGN_IN_PATH}>
        {t("getStarted")}
      </Button>
    </main>
  );
}
