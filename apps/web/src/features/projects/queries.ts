import "server-only";

import { db, type ProjectView, projectColumns, projects } from "@repo/db";
import { and, asc, count, desc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import type { ProjectFilters } from "./schema";

/**
 * Reads for the projects feature. Every function here:
 *
 *   - takes the user id as a parameter — never the session. These are cached,
 *     and a cached function that read the session would serve one user's rows
 *     to the next (rule 6);
 *   - scopes by owner inside the WHERE clause, not after (rule 4);
 *   - excludes soft-deleted rows (rule 13);
 *   - selects `projectColumns`, never `*` (rule 5).
 */

export type ProjectPage = {
  items: ProjectView[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listProjects(userId: string, filters: ProjectFilters): Promise<ProjectPage> {
  "use cache";
  cacheTag(cacheTags.projects(userId));

  const where = and(
    eq(projects.ownerId, userId),
    isNull(projects.deletedAt),
    ...buildFilters(filters),
  );

  const [items, [totals]] = await Promise.all([
    db
      .select(projectColumns)
      .from(projects)
      .where(where)
      // The id breaks ties so a page boundary never shuffles between requests.
      .orderBy(orderBy(filters), desc(projects.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(projects).where(where),
  ]);

  return { items, total: totals?.total ?? 0, page: filters.page, pageSize: filters.pageSize };
}

/**
 * One project the user owns, or null. Null covers "does not exist", "belongs
 * to someone else" and "deleted" alike — the caller turns it into a 404 and
 * nothing distinguishes the three from outside.
 */
export async function getProject(userId: string, projectId: string): Promise<ProjectView | null> {
  "use cache";
  cacheTag(cacheTags.project(projectId), cacheTags.projects(userId));

  const [project] = await db
    .select(projectColumns)
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, userId), isNull(projects.deletedAt)),
    )
    .limit(1);

  return project ?? null;
}

/** Only the columns in PROJECT_SORT_FIELDS — the schema has already refused anything else. */
const sortColumns = {
  name: projects.name,
  status: projects.status,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

function orderBy(filters: ProjectFilters): SQL {
  const column = sortColumns[filters.sort];
  return filters.dir === "asc" ? asc(column) : desc(column);
}

function buildFilters(filters: ProjectFilters): SQL[] {
  const clauses: SQL[] = [];
  if (filters.status) clauses.push(eq(projects.status, filters.status));
  if (filters.q) clauses.push(ilike(projects.name, `%${escapeLike(filters.q)}%`));
  return clauses;
}

/**
 * `%` and `_` are wildcards inside LIKE. Left unescaped, a search for "100%"
 * matches every name starting with 100, and "_" matches any single character —
 * not a security hole, but a wrong answer that is hard to notice.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
