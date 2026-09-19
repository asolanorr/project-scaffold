"use client";

import { Input } from "@repo/ui/components/base/input/input";
import { Select } from "@repo/ui/components/base/select/select";
import { SearchLg } from "@repo/ui/icons";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { PROJECT_SEARCH_MAX, PROJECT_STATUSES, type ProjectStatus } from "../schema";
import { projectSearchParams } from "../search-params";

const ALL = "all";
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search and status filter, both written to the URL. Search is debounced so
 * the server is not asked for a page per keystroke; the status select
 * applies at once. Either change resets to page one.
 */
export function ProjectFilters() {
  const t = useTranslations("projects.list");
  const tStatus = useTranslations("projects.status");
  const [params, setParams] = useQueryStates(projectSearchParams, {
    shallow: false,
    history: "push",
  });

  // Local text state so typing stays responsive while the URL lags behind by
  // the debounce. Follows the URL when it changes underneath (back button).
  const [search, setSearch] = useState(params.q);
  useEffect(() => {
    setSearch(params.q);
  }, [params.q]);

  useEffect(() => {
    if (search === params.q) return;
    const handle = setTimeout(() => setParams({ q: search, page: 1 }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, params.q, setParams]);

  const statusItems = [
    { id: ALL, label: t("allStatuses") },
    ...PROJECT_STATUSES.map((status) => ({ id: status, label: tStatus(status) })),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Input
        type="search"
        size="sm"
        className="sm:max-w-xs"
        icon={SearchLg}
        aria-label={t("search")}
        placeholder={t("searchPlaceholder")}
        maxLength={PROJECT_SEARCH_MAX}
        value={search}
        onChange={setSearch}
      />
      <Select
        size="sm"
        className="sm:w-48"
        aria-label={t("statusFilter")}
        items={statusItems}
        selectedKey={params.status ?? ALL}
        onSelectionChange={(key) =>
          setParams({ status: key === ALL ? null : (key as ProjectStatus), page: 1 })
        }
      >
        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
      </Select>
    </div>
  );
}
