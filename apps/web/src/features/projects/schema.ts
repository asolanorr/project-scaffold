import { projectStatus } from "@repo/db/schema";
import { z } from "zod";

// Input the database does not model: list filters and the id an action acts
// on. Row shapes come from @repo/db (`insertProjectSchema`, `updateProjectSchema`).
//
// Imports from `@repo/db/schema`, not `@repo/db`: this module is shared with
// client components, and the package barrel would pull the Postgres client
// into the browser bundle.

export const PROJECT_PAGE_SIZE = 20;
export const PROJECT_PAGE_SIZE_MAX = 100;
export const PROJECT_SEARCH_MAX = 120;

/** Columns the list can be ordered by. Anything else is ignored, never trusted. */
export const PROJECT_SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export const PROJECT_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type ProjectSortDirection = (typeof PROJECT_SORT_DIRECTIONS)[number];

export const PROJECT_STATUSES = projectStatus.enumValues;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectFiltersSchema = z.object({
  /** Substring match on the name, case-insensitive. */
  q: z.string().trim().min(1).max(PROJECT_SEARCH_MAX).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  sort: z.enum(PROJECT_SORT_FIELDS).default("createdAt"),
  dir: z.enum(PROJECT_SORT_DIRECTIONS).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PROJECT_PAGE_SIZE_MAX).default(PROJECT_PAGE_SIZE),
});

export type ProjectFilters = z.infer<typeof projectFiltersSchema>;

/** The `id` field a mutation on an existing project receives. */
export const projectIdSchema = z.object({ id: z.uuid() });

/** Form-level failures a project action can report. Keys under `projects.errors`. */
export const PROJECT_ERROR_KEYS = ["notFound", "nameTaken"] as const;

export type ProjectErrorCode = (typeof PROJECT_ERROR_KEYS)[number];
