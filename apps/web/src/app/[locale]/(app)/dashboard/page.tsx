import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { SessionDetails } from "@/features/auth/components/session-details";
import { resolveLocale } from "@/lib/locale";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("dashboard");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>
      <div>
        <Button color="secondary" href="/projects">
          {t("projectsLink")}
        </Button>
      </div>

      {/* With cacheComponents on, anything that reads request data — the
          session, inside SessionDetails — has to sit behind a boundary, or the
          whole route blocks until that read finishes. The heading above ships
          immediately; only this part waits. */}
      <Suspense fallback={<p className="text-md text-tertiary">{t("loading")}</p>}>
        <SessionDetails />
      </Suspense>
    </main>
  );
}
