import { createLoader, parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs/server";
import {
  PROJECT_SEARCH_MAX,
  PROJECT_SORT_DIRECTIONS,
  PROJECT_SORT_FIELDS,
  PROJECT_STATUSES,
  type ProjectFilters,
  projectFiltersSchema,
} from "./schema";

/**
 * The list's URL state, declared once.
 *
 * The page reads it on the server with `loadProjectSearchParams`; the table
 * and filters write it on the client with `useQueryStates(projectSearchParams)`.
 * Because the state is the URL, a filtered view is a link that can be shared,
 * and the back button steps through what the user did.
 *
 * `nuqs/server` is importable from both sides; only the loader below is
 * server-flavoured. Defaults are omitted from the URL, so `/projects` stays
 * `/projects` until the user changes something.
 */
export const projectSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(PROJECT_STATUSES),
  sort: parseAsStringLiteral(PROJECT_SORT_FIELDS).withDefault("createdAt"),
  dir: parseAsStringLiteral(PROJECT_SORT_DIRECTIONS).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
};

const load = createLoader(projectSearchParams);

/**
 * Parse the request's search params into query filters.
 *
 * nuqs handles the URL shape; the Zod schema still runs last so bounds
 * (page ≥ 1, search length) are enforced in one place, and anything that
 * fails falls back to the default rather than an error page.
 */
export async function loadProjectSearchParams(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<ProjectFilters> {
  const raw = await load(searchParams);
  const parsed = projectFiltersSchema.safeParse({
    q: raw.q.slice(0, PROJECT_SEARCH_MAX) || undefined,
    status: raw.status ?? undefined,
    sort: raw.sort,
    dir: raw.dir,
    page: raw.page,
  });
  return parsed.success ? parsed.data : projectFiltersSchema.parse({});
}
