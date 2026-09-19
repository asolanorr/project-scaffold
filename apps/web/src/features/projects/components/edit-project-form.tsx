import { requireSession } from "@repo/auth";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveLocale } from "@/lib/locale";
import { updateProject } from "../actions";
import { getProject } from "../queries";
import { projectIdSchema } from "../schema";
import { ProjectForm } from "./project-form";

export async function EditProjectForm({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const { id } = await params;
  if (!projectIdSchema.safeParse({ id }).success) notFound();

  const session = await requireSession();
  const project = await getProject(session.user.id, id);
  if (!project) notFound();

  const t = await getTranslations("projects.form");

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-display-xs font-semibold text-primary">{t("editTitle")}</h1>
        <p className="text-md text-tertiary">{t("editSubtitle")}</p>
      </header>
      <ProjectForm
        mode="edit"
        action={updateProject}
        projectId={project.id}
        defaultValues={project}
      />
    </>
  );
}
