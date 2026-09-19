import { requireSession } from "@repo/auth";
import { Button } from "@repo/ui/components/base/buttons/button";
import { ArrowLeft } from "@repo/ui/icons";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { resolveLocale } from "@/lib/locale";
import { getProject } from "../queries";
import { projectIdSchema } from "../schema";
import { DeleteProjectButton } from "./delete-project-button";
import { ProjectStatusBadge } from "./project-status-badge";

export async function ProjectDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const { id } = await params;
  // Not a uuid: 404 before anything touches the database.
  if (!projectIdSchema.safeParse({ id }).success) notFound();

  const session = await requireSession();
  const project = await getProject(session.user.id, id);
  // Missing, deleted and someone else's all end here, indistinguishably.
  if (!project) notFound();

  const t = await getTranslations("projects.detail");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();

  return (
    <article className="flex flex-col gap-6">
      <div>
        <Button color="link-gray" size="md" href="/projects" iconLeading={<ArrowLeft data-icon />}>
          {t("backToList")}
        </Button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-xs font-semibold text-primary">{project.name}</h1>
          <div>
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex gap-3">
          <Button color="secondary" href={`/projects/${project.id}/edit`}>
            {tCommon("edit")}
          </Button>
          <DeleteProjectButton id={project.id} name={project.name} />
        </div>
      </header>

      <p className="max-w-prose text-md text-tertiary">
        {project.description ?? t("noDescription")}
      </p>

      <dl className="flex flex-col gap-1 text-sm text-quaternary">
        <div>
          {t("created", { date: format.dateTime(project.createdAt, { dateStyle: "long" }) })}
        </div>
        <div>
          {t("updated", { date: format.dateTime(project.updatedAt, { dateStyle: "long" }) })}
        </div>
      </dl>
    </article>
  );
}
