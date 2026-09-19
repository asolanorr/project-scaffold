/**
 * Every cache tag in the application, as functions.
 *
 * No raw tag strings anywhere, for the same reason as no raw paths: a typo in a
 * tag is invisible. `updateTag("porjects:u_1")` throws no error, matches no
 * cache entry, and the stale page just keeps being served.
 *
 * Per-user tags take the user id as an argument because a cached function must
 * be a pure function of its arguments. A `"use cache"` block may never read
 * `cookies()`, `headers()` or the session — it would cache one user's data
 * under a key that the next user also matches, which is an authorization
 * failure that no permission check catches, because the code is right and the
 * cache is wrong.
 *
 * Invalidate with `updateTag(tag)` when the user must see their own write
 * immediately, or `revalidateTag(tag, "max")` when background staleness is
 * fine. Never `revalidatePath` — with a [locale] segment and route groups the
 * real route is `/[locale]/(app)/projects`, so `revalidatePath("/projects")`
 * matches nothing and fails silently, and the English user sees their change
 * while the Spanish one does not.
 */
export const cacheTags = {
  /** Every project belonging to one user. */
  projects: (userId: string) => `projects:${userId}` as const,
  /** One project, for the detail view. */
  project: (projectId: string) => `project:${projectId}` as const,
  /** A user's own profile data. */
  user: (userId: string) => `user:${userId}` as const,
} as const;

export type CacheTag = ReturnType<(typeof cacheTags)[keyof typeof cacheTags]>;
