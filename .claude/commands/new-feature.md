---
description: Build a feature the way this codebase requires, with a cross-user scoping test
argument-hint: <what the feature does>
---

Build this feature: $ARGUMENTS

Work in this order and do not skip ahead. Each step has to compile before the
next one starts.

## 0. Read first

1. Read `AGENTS.md` completely, including "What is enforced mechanically", and
   the nested `AGENTS.md` of any package you will touch.
2. Read the matching recipes under `apps/docs/content/docs/recipes/`:
   `add-a-table.mdx` and `add-a-feature.mdx` always; `add-a-protected-route.mdx`,
   `add-a-background-job.mdx` or `add-an-email.mdx` when the feature needs them.
3. Read the reference implementation, `features/projects`. If it is not in this
   checkout (it is removed by `pnpm run project:init` when declined), read it
   from the upstream repo instead: `git show upstream/main:<path>`. Features that
   exist here (`files`, `payments`, `admin`) are also good models.

If anything in the request conflicts with a rule in `AGENTS.md`, say so before
writing code, and propose the compliant version. Do not silently drop either.

## 1. Plan, in writing, before any code

State, in a short plan: the table and its columns (owner, soft delete,
timestamps), the queries, the actions, the components, the routes, the message
keys (both locales), the cache tags, and the tests. Name the user-facing
strings. Then proceed; do not wait for approval unless something is ambiguous.

## 2. Implement in dependency order

1. **Schema.** `packages/db/src/schema/<entity>.ts`, exported from the barrel;
   `pnpm db:generate`, read the SQL, `pnpm db:migrate`. Never edit an applied
   migration. Derive Zod schemas with `.pick()`, never `.omit()`.
2. **Feature schema.** `apps/web/src/features/<name>/schema.ts` for input the
   database does not model.
3. **Queries.** `queries.ts`, starting with `import "server-only"`. The user id
   is a parameter, ownership and `deletedAt IS NULL` are in the `WHERE`, named
   columns only, tagged with a name from `cacheTags`.
4. **Actions.** `actions.ts`, starting with `"use server"`. Every action:
   `await requireSession()` first, then validate, then authorize in the query,
   then execute, then `updateTag(cacheTags.…)`, then return a typed result.
   Export nothing but async functions and types.
5. **Components.** Server components by default; `"use client"` only on leaves.
   Strings through next-intl, both `en.json` and `es.json`. Links and redirects
   from `@/lib/routes`, never a literal path. Reach for `@repo/ui` first.
6. **Routes.** Thin: layout, params, Suspense. Add the prefix to
   `PROTECTED_PREFIXES` in `lib/routes.ts`.
7. **No imports between features.** If two features need the same thing, it
   moves up to `lib/` or a package.

## 3. Tests, required

- Unit tests for the actions and queries with `setupTestTransaction()`.
- **A cross-user scoping test is mandatory.** Create rows as user A; then, as
  user B: (a) listing returns none of A's rows, (b) reading A's row by id gets
  `notFound()` — **404, never 403** — and (c) updating or deleting A's row
  changes nothing and also gets not-found. Assert A's row is unchanged
  afterwards. A feature without this test is not finished.
- Unauthenticated calls, validation failures, a field outside the allowlist
  being dropped, and soft delete (gone from the list, restore brings it back).
- One Playwright spec for the main flow, in `e2e/`, using roles and accessible
  names.

## 4. Verify

Run `pnpm check` and read the result. The architecture test and the Biome rules
run inside it; if one fires, fix the code, never the rule. If it cannot pass,
say so and show the failure; do not report the task as done.

## 5. Finish with a deviations report

End your final message with this section, even when it is empty:

**Deviations from the rules**
- the rule (AGENTS.md number or name), where in the code, and why it was
  unavoidable. Include every `biome-ignore lint/plugin` and every
  `arch-allow(...)` you added, with its reason.
- Write "None." if there were none.
