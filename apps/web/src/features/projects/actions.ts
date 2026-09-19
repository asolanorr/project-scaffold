"use server";

import { ownedBy, requireSession } from "@repo/auth";
import {
  db,
  insertProjectSchema,
  type ProjectView,
  projectColumns,
  projects,
  updateProjectSchema,
} from "@repo/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { cacheTags } from "@/lib/cache-tags";
import { parseFormData } from "@/lib/form";
import { messageKeys } from "@/lib/validation";
import { type ProjectErrorCode, projectIdSchema } from "./schema";

export type ProjectActionState = ActionState<ProjectView, ProjectErrorCode>;

/** Postgres: unique_violation. Here that is always `projects_owner_name_uq`. */
const UNIQUE_VIOLATION = "23505";

export async function createProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate — parseFormData, never Object.fromEntries. The schema is the
  //    .pick() allowlist from @repo/db: a field outside it is dropped here,
  //    whatever the form sent.
  const parsed = insertProjectSchema.safeParse(parseFormData(formData), { error: messageKeys });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 3. authorize — any signed-in user may create; the owner is the session,
  //    never a field from the form.
  // 4. execute — named columns, never the row
  try {
    const [project] = await db
      .insert(projects)
      .values({ ...parsed.data, ownerId: session.user.id })
      .returning(projectColumns);
    // INSERT … RETURNING always yields the row; its absence is a bug, not a
    // state to report.
    if (!project) throw new Error("insert returned no row");

    // 5. invalidate — by tag, never by path
    updateTag(cacheTags.projects(session.user.id));

    // 6. respond
    return { ok: true, data: project };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "nameTaken" };
    throw error;
  }
}

export async function updateProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate
  const input = parseFormData(formData);
  const id = projectIdSchema.safeParse(input, { error: messageKeys });
  if (!id.success) return { ok: false, code: "notFound" };
  const parsed = updateProjectSchema.safeParse(input, { error: messageKeys });
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 3. authorize + 4. execute — ownership is the WHERE clause. A row that is
  //    missing, someone else's or deleted updates nothing, and all three look
  //    the same from outside.
  try {
    const [project] = await db
      .update(projects)
      .set(parsed.data)
      .where(ownedBy(projects, id.data.id, session.user.id))
      .returning(projectColumns);
    if (!project) return { ok: false, code: "notFound" };

    // 5. invalidate
    updateTag(cacheTags.projects(session.user.id));
    updateTag(cacheTags.project(project.id));

    // 6. respond
    return { ok: true, data: project };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "nameTaken" };
    throw error;
  }
}

export async function deleteProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate
  const id = projectIdSchema.safeParse(parseFormData(formData), { error: messageKeys });
  if (!id.success) return { ok: false, code: "notFound" };

  // 3. authorize + 4. execute — a soft delete is an update scoped by owner.
  const [project] = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(ownedBy(projects, id.data.id, session.user.id))
    .returning(projectColumns);
  if (!project) return { ok: false, code: "notFound" };

  // 5. invalidate
  updateTag(cacheTags.projects(session.user.id));
  updateTag(cacheTags.project(project.id));

  // 6. respond
  return { ok: true, data: project };
}

export async function restoreProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate
  const id = projectIdSchema.safeParse(parseFormData(formData), { error: messageKeys });
  if (!id.success) return { ok: false, code: "notFound" };

  // 3. authorize + 4. execute — the one write that must see deleted rows, so
  //    it spells the predicate out instead of using ownedBy(), and only ever
  //    matches a row that is currently deleted.
  try {
    const [project] = await db
      .update(projects)
      .set({ deletedAt: null })
      .where(
        and(
          eq(projects.id, id.data.id),
          eq(projects.ownerId, session.user.id),
          isNotNull(projects.deletedAt),
        ),
      )
      .returning(projectColumns);
    if (!project) return { ok: false, code: "notFound" };

    // 5. invalidate
    updateTag(cacheTags.projects(session.user.id));
    updateTag(cacheTags.project(project.id));

    // 6. respond
    return { ok: true, data: project };
  } catch (error) {
    // A project with the same name was created while this one was deleted;
    // the partial unique index refuses to bring it back.
    if (isUniqueViolation(error)) return { ok: false, code: "nameTaken" };
    throw error;
  }
}

/**
 * The one database failure a user can cause and fix: a duplicate name. It
 * becomes a code, and the error itself never leaves — a constraint name or a
 * stack trace is not something the browser should read. Anything else is a
 * bug and is rethrown for the error boundary and Sentry (rule 11).
 */
function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver error in a DrizzleQueryError; the Postgres code
  // is on the cause. Checked on both, so a driver that does not wrap still works.
  return (
    (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION ||
    (error as { cause?: { code?: unknown } } | null)?.cause?.code === UNIQUE_VIOLATION
  );
}
