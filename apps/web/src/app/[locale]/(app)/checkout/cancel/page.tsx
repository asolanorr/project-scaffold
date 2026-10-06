import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveLocale } from "@/lib/locale";

export default async function CheckoutCancelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("checkout.cancel");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col items-start gap-3 px-4 py-12 md:px-8">
      <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>
      <p className="text-md text-tertiary">{t("description")}</p>
      <Button color="secondary" href="/dashboard">
        {t("backLink")}
      </Button>
    </main>
  );
}
