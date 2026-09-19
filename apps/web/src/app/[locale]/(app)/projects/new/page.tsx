import { getTranslations, setRequestLocale } from "next-intl/server";
import { createProject } from "@/features/projects/actions";
import { ProjectForm } from "@/features/projects/components/project-form";
import { resolveLocale } from "@/lib/locale";

export default async function NewProjectPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("projects.form");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 md:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-xs font-semibold text-primary">{t("createTitle")}</h1>
        <p className="text-md text-tertiary">{t("createSubtitle")}</p>
      </header>
      <ProjectForm mode="create" action={createProject} />
    </main>
  );
}
