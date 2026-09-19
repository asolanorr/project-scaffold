import { projectStatus } from "@repo/db";
import { z } from "zod";

// Input the database does not model: list filters and the id an action acts
// on. Row shapes come from @repo/db (`insertProjectSchema`, `updateProjectSchema`).

export const PROJECT_PAGE_SIZE = 20;
export const PROJECT_PAGE_SIZE_MAX = 100;
export const PROJECT_SEARCH_MAX = 120;

export const projectFiltersSchema = z.object({
  /** Substring match on the name, case-insensitive. */
  q: z.string().trim().min(1).max(PROJECT_SEARCH_MAX).optional(),
  status: z.enum(projectStatus.enumValues).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PROJECT_PAGE_SIZE_MAX).default(PROJECT_PAGE_SIZE),
});

export type ProjectFilters = z.infer<typeof projectFiltersSchema>;

/** The `id` field a mutation on an existing project receives. */
export const projectIdSchema = z.object({ id: z.uuid() });

/** Form-level failures a project action can report. Keys under `projects.errors`. */
export const PROJECT_ERROR_KEYS = ["notFound", "nameTaken"] as const;

export type ProjectErrorCode = (typeof PROJECT_ERROR_KEYS)[number];
