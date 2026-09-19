import { requireSession } from "@repo/auth";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { listProjects } from "../queries";
import { loadProjectSearchParams } from "../search-params";
import { ProjectsTable } from "./projects-table";

/**
 * The request-dependent half of the list page: session and search params
 * are both request data, so this sits behind the page's Suspense boundary
 * and the heading above it prerenders.
 *
 * The nuqs adapter lives here rather than in the root providers because it
 * reads the pathname and search params — request data — and here it is
 * already inside the boundary.
 */
export async function ProjectsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const filters = await loadProjectSearchParams(searchParams);
  const page = await listProjects(session.user.id, filters);

  return (
    <NuqsAdapter>
      <ProjectsTable page={page} />
    </NuqsAdapter>
  );
}
