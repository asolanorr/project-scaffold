import { Button } from "@repo/ui/components/base/buttons/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProjectsList } from "@/features/projects/components/projects-list";
import { ProjectsListSkeleton } from "@/features/projects/components/skeletons";
import { resolveLocale } from "@/lib/locale";
import { PROJECTS_NEW_PATH } from "@/lib/routes";

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("projects");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>
          <p className="text-md text-tertiary">{t("description")}</p>
        </div>
        <Button href={PROJECTS_NEW_PATH}>{t("new")}</Button>
      </header>

      {/* The heading prerenders; the session and the search params are
          request data and wait behind the boundary. */}
      <Suspense fallback={<ProjectsListSkeleton />}>
        <ProjectsList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
