"use client";

import type { ProjectView } from "@repo/db/schema";
import { Button } from "@repo/ui/components/base/buttons/button";
import { createDataTableColumnHelper, DataTable } from "@repo/ui/composed/data-table";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useMemo, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { PROJECTS_NEW_PATH, projectPath } from "@/lib/routes";
import type { ProjectPage } from "../queries";
import { PROJECT_PAGE_SIZE, PROJECT_SORT_FIELDS, type ProjectSortField } from "../schema";
import { projectSearchParams } from "../search-params";
import { ProjectFilters } from "./project-filters";
import { ProjectStatusBadge } from "./project-status-badge";

const helper = createDataTableColumnHelper<ProjectView>();

function isSortField(value: string): value is ProjectSortField {
  return PROJECT_SORT_FIELDS.includes(value as ProjectSortField);
}

/**
 * The list, with its filters, sort and page held in the URL.
 *
 * The server rendered `page` for the URL it was given; every change here
 * writes the URL (nuqs, `shallow: false`) and the server renders again. The
 * transition tracks that round trip so the table can show it. Nothing is
 * fetched from the client.
 */
export function ProjectsTable({ page }: { page: ProjectPage }) {
  const t = useTranslations("projects.list");
  const tProjects = useTranslations("projects");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(projectSearchParams, {
    shallow: false,
    history: "push",
    startTransition,
  });

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: t("columns.name"),
          cell: (info) => (
            <Link
              href={projectPath(info.row.original.id)}
              className="font-medium text-primary hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }),
        helper.accessor("status", {
          header: t("columns.status"),
          cell: (info) => <ProjectStatusBadge status={info.getValue()} />,
        }),
        helper.accessor("updatedAt", {
          header: t("columns.updatedAt"),
          cell: (info) => format.dateTime(info.getValue(), { dateStyle: "medium" }),
        }),
        helper.accessor("createdAt", {
          header: t("columns.createdAt"),
          cell: (info) => format.dateTime(info.getValue(), { dateStyle: "medium" }),
        }),
      ]),
    [t, format],
  );

  const isFiltered = params.q !== "" || params.status !== null;

  return (
    <div className="flex flex-col gap-4">
      <ProjectFilters />

      <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        <DataTable
          columns={columns}
          data={page.items}
          getRowId={(row) => row.id}
          pageCount={Math.ceil(page.total / page.pageSize)}
          pagination={{ pageIndex: params.page - 1, pageSize: PROJECT_PAGE_SIZE }}
          onPaginationChange={(next) => setParams({ page: next.pageIndex + 1 })}
          sorting={[{ id: params.sort, desc: params.dir === "desc" }]}
          onSortingChange={(next) => {
            const first = next[0];
            if (!first || !isSortField(first.id)) return;
            // A new order restarts at page one; page 4 of a different order
            // is not a page the user asked for.
            setParams({ sort: first.id, dir: first.desc ? "desc" : "asc", page: 1 });
          }}
          isLoading={isPending}
          labels={{
            table: t("ariaLabel"),
            loading: tCommon("loading"),
            empty: isFiltered ? t("emptyFiltered") : t("empty"),
            emptyDescription: isFiltered ? t("emptyFilteredDescription") : t("emptyDescription"),
            error: t("error"),
            previous: t("previous"),
            next: t("next"),
            pagination: t("pagination"),
            pageOf: (current, total) => t("pageOf", { page: current, total }),
          }}
          emptyAction={
            isFiltered ? (
              <Button
                color="secondary"
                size="sm"
                onPress={() => setParams({ q: "", status: null, page: 1 })}
              >
                {t("clearFilters")}
              </Button>
            ) : (
              <Button size="sm" href={PROJECTS_NEW_PATH}>
                {tProjects("new")}
              </Button>
            )
          }
        />
      </div>
    </div>
  );
}
