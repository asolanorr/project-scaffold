# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before
writing or modifying any code. Nested `AGENTS.md` files exist in some packages
and take precedence within their folder.

---

## Project map

```
apps/web        Next.js application (App Router)
apps/docs       Fumadocs documentation site
packages/db     Drizzle schema, client, migrations, seed
packages/auth   Better Auth configuration and helpers
packages/ui     Shared components and Tailwind preset
packages/env    Validated environment variables
packages/config Shared tsconfig, biome and tailwind configs
```

## Commands

```bash
pnpm dev              # run everything
pnpm check            # lint + typecheck + test — run before finishing any task
pnpm db:generate      # create a migration after changing schema
pnpm db:migrate       # apply migrations
pnpm test -- <file>   # single test file
```

Always run `pnpm check` before declaring a task complete. Never commit code
that fails typecheck.

---

## The rules

These are non-negotiable. Violating one means the change gets rejected.

1. **Route files are thin.** Files under `app/` handle layout, params, metadata
   and Suspense boundaries only. Business logic lives in
   `features/<name>/actions.ts` or `queries.ts`.

2. **Types are derived, never written twice.** Entity types come from the
   Drizzle schema through `drizzle-zod`. If you find yourself declaring an
   interface that mirrors a table, stop and derive it instead. Derive with
   `.pick()`, never `.omit()` — a denylist makes every future column writable
   from the request body.

3. **Every server action starts with authentication.** Call `requireSession()`
   first, then validate input with Zod, then check ownership. Never trust an ID
   from the client without verifying who owns the record. Every exported
   function in a `"use server"` file is a public HTTP endpoint — never export a
   helper from one, and never rely on the UI to restrict input.

4. **Authorize in the query, not after it.** Ownership goes in the `WHERE`
   clause: `and(eq(t.id, id), eq(t.ownerId, session.user.id))`. Return 404 for
   a missing row, never 403. Never fetch first and check second.

5. **Never return a raw database row.** Actions and queries select named
   columns. A column added later must not leave the server by default.

6. **Cached functions are pure functions of their arguments.** Inside
   `"use cache"`, never call `cookies()`, `headers()` or the session. Per-user
   data takes the user id as a parameter and puts it in the tag. Getting this
   wrong serves one user's data to another.

7. **Server Components by default.** Add `"use client"` only when the component
   needs state, effects, browser APIs or event handlers. Push the directive as
   far down the tree as possible — a client leaf inside a server page, not a
   client page.

8. **No data fetching in `useEffect`.** Fetch on the server. If the data
   genuinely must be client-side (polling, infinite scroll, user-triggered
   refetch), use TanStack Query — never a bare `fetch` in an effect.

9. **Mutations go through Server Actions.** Do not create API route handlers
   for internal application writes. Route handlers exist only for webhooks and
   public APIs consumed by third parties.

10. **Database access only through `@repo/db`.** No raw SQL strings in feature
   code, no `supabase-js` client for application queries. If a query is complex,
   put it in `packages/db` with a name and a test.

11. **Actions return, they don't throw, for expected failures.** Validation
   errors, not-found and unauthorized all return a typed result object. Throw
   only for genuine bugs, which the error boundary and Sentry will catch.

12. **Invalidate caches by tag, never by path.** Use `updateTag` with a name
   from `cacheTags`. `revalidatePath` with a literal URL silently does nothing
   once locales and route groups are in the path.

13. **Reads exclude soft-deleted rows.** Every query on a table with
   `deletedAt` filters `IS NULL`. This is why reads live in named query
   functions instead of inline at the call site.

14. **Never write secrets or environment variables inline.** Everything comes
   from `@repo/env`, which validates at boot. Adding a variable means adding it
   to the schema and to `.env.example` in the same change.

---

## The canonical mutation

Copy this shape for every write. Six steps, always in this order.

```ts
"use server";

import { updateTag } from "next/cache";
import { db, projects } from "@repo/db";
import { requireSession } from "@repo/auth";
import { insertProjectSchema } from "../schema";

export async function createProject(
  _prev: ActionState<Project>,
  formData: FormData,
): Promise<ActionState<Project>> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate — parseFormData, never Object.fromEntries
  const parsed = insertProjectSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 3. authorize — verify ownership for updates and deletes
  // 4. execute
  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, ownerId: session.user.id })
    .returning();

  // 5. invalidate — by tag, never by path
  updateTag(cacheTags.projects(session.user.id));

  // 6. respond
  return { ok: true, data: project };
}
```

Consume it with `useActionState` and `useFormStatus`. Do not add manual loading
state, and do not wrap it in a client-side fetch.

## The canonical read

```ts
import "server-only";

export async function listProjects(userId: string, filters: ProjectFilters) {
  return db.query.projects.findMany({
    where: and(eq(projects.ownerId, userId), buildFilters(filters)),
    orderBy: desc(projects.createdAt),
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  });
}
```

Query files carry `import "server-only"` at the top so a client import fails at
build time rather than leaking database credentials.

---

## Adding a feature

Follow this sequence. Do not skip ahead — each step depends on the previous one
compiling.

1. Define the table in `packages/db/src/schema/<entity>.ts` and export it from
   the barrel file.
2. Run `pnpm db:generate`, review the generated SQL, then `pnpm db:migrate`.
3. Derive Zod schemas in `apps/web/src/features/<name>/schema.ts`.
4. Write `queries.ts` (reads) and `actions.ts` (writes).
5. Build components under `features/<name>/components/`.
6. Add the route under `app/(app)/<name>/` — thin, as per rule 1.
7. Write tests: unit tests for the actions, one Playwright spec for the main
   user flow.
8. Run `pnpm check`.

The `projects` feature is the reference implementation. When in doubt about a
pattern, read that folder rather than inventing something new.

---

## Conventions

**Naming.** Files in `kebab-case`. React components in `PascalCase`. Database
tables and columns in `snake_case`; the Drizzle mapping handles the conversion
to `camelCase` in TypeScript. Booleans read as assertions: `isActive`,
`hasAccess`, never `active` or `flag`.

**Imports.** Workspace packages by alias (`@repo/db`), never relative paths
that climb out of a package. Within `apps/web`, use `@/` for the src root.

**Components.** One component per file. Props typed inline for simple cases,
as an exported interface when the component is shared. No default exports
except for Next.js route files, which require them.

**Comments.** Explain why, not what. A comment restating the code is noise. A
comment explaining a non-obvious constraint or a deliberate trade-off is
valuable.

**Commits.** Conventional Commits: `feat(projects): add status filter`. Scope
is the feature or package name.

---

## UI components

The component layer is Untitled UI React, built on React Aria and Tailwind v4.
Full rules live in `packages/ui/AGENTS.md`. The three that matter everywhere:

- **Check `@repo/ui` before building anything.** Most primitives already exist.
  If one is missing, add it with the Untitled UI CLI rather than writing it.
- **React Aria only.** Never install or copy Radix, shadcn/ui or Headless UI
  components. This codebase has one primitive layer and keeps it.
- **Style with design tokens, not raw values.** `bg-brand-600`, not
  `bg-[#7F56D9]`. The tokens mirror the Figma kit; hardcoded values break that
  link silently.

---

## Internationalization

Every user-facing string is translated. There are no exceptions, including
error messages, empty states, toasts, button labels and email subjects.

- **No hardcoded strings in JSX.** Use `useTranslations("<feature>")` in client
  components and `getTranslations` in server components.
- **Add both locales in the same change.** A key in `en.json` without its `es.json`
  counterpart is an incomplete change. If you can't write the Spanish, add the
  key with the English text and flag it in the PR description.
- **Keys are namespaced by feature** and describe meaning, not appearance:
  `projects.emptyState.title`, not `projects.grayText`.
- **Format dates, numbers and currency with `useFormatter`.** Never build them
  by string concatenation and never hardcode a separator.
- **Store codes, translate at render.** Enum values, statuses and types live in
  the database in English as codes. The translation happens in the component.
- **Links use the localized helpers** from `@/i18n/routing`, not bare
  `next/link`, so the locale prefix is preserved.

---

## What not to do

Common mistakes that look reasonable but violate the architecture:

- Creating `app/api/projects/route.ts` to call from a client form. Use a
  server action.
- Writing `interface Project { id: string; name: string }` by hand. Derive it.
- Adding `"use client"` to a page because one button inside needs an onClick.
  Extract the button.
- Calling `revalidatePath` to make something refresh. Tag the read and call
  `updateTag`.
- Wrapping `requireSession()` in a `try/catch`. It redirects by throwing, and a
  catch-all swallows the redirect.
- Using `Object.fromEntries(formData)`. It loses multi-value fields and skips
  type coercion.
- Skipping a session check because the middleware redirects unauthenticated
  users. Middleware is UX, not authorization.
- Adding a mutating route handler. Route handlers are for webhooks only, and a
  webhook verifies its signature.
- Widening a Zod schema to make a form submit. If a field is rejected, either
  it belongs in the allowlist or the form is sending something it shouldn't.
- Returning a Drizzle error, a stack trace or the parsed input to the client.
- Installing a dependency to solve something the stack already covers. Check
  `packages/` first, and ask before adding to the root `package.json`.
- Using `any` or `as unknown as T` to silence a type error. The error is
  usually pointing at a real design problem.
- Editing files under `packages/db/migrations/` after they have been applied.
  Generate a new migration instead.
- Writing a visible string directly in JSX "just for now". It never gets
  translated later.
- Storing a translated label in a database column that the UI renders as-is.

---

## Before you finish

- [ ] `pnpm check` passes
- [ ] New logic has tests
- [ ] No new `any`, no `@ts-expect-error` without an explanatory comment
- [ ] Environment variables added to schema and `.env.example`
- [ ] Migration generated and committed if the schema changed
- [ ] The change is described in one sentence that would make sense in a
      changelog
