# Scaffold

A production-ready starting point for web applications: Next.js App Router,
Postgres through Drizzle, Better Auth, Untitled UI on React Aria, next-intl
with English and Spanish, all in a pnpm + Turborepo monorepo. Every piece has
a free tier, and the data layer is plain Postgres, so nothing here locks a
project in.

- [ARCHITECTURE.md](ARCHITECTURE.md) — the decisions and why they were made
- [AGENTS.md](AGENTS.md) — the rules for anyone (or anything) writing code here

## Prerequisites

- Node 24 (anything ≥ 20.9 works) and pnpm 10 — `corepack enable` picks the
  pinned version up from `package.json`
- Docker Desktop (or any Docker engine). Postgres runs in a container either
  way; see the two options below.

## Quick start

```bash
pnpm install
cp .env.example .env         # values below depend on which database option you pick
pnpm db:migrate              # apply the SQL migrations
pnpm dev                     # http://localhost:3000
```

Sign up at `/sign-up`, land on `/dashboard`. `/es/...` serves the same pages
in Spanish.

### Database option A — Supabase local (matches production)

The [Supabase CLI](https://supabase.com/docs/guides/local-development) runs
the same stack a deployed project uses: Postgres behind a pooler on 6543 and
direct on 5432, plus Studio at <http://localhost:54323>.

```bash
pnpm dlx supabase init        # once, creates ./supabase (commit it)
pnpm dlx supabase start       # pulls the images on first run, ~2 min
pnpm dlx supabase status      # prints the connection strings
```

Put the printed `DB URL` in `.env` for both variables — with the CLI's
defaults:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

The pooled/direct split only matters on a hosted project, where the
serverless runtime needs the pooler; locally the direct port serves both.

`supabase stop` shuts it down and keeps the data; `supabase stop --no-backup`
throws the data away.

### Database option B — plain Postgres in Docker (fastest)

One container, no pooler. Fine for development and for running the test
suite; the app does not care which it talks to.

```bash
docker run --name scaffold-pg -d   -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=scaffold   -p 5432:5432 postgres:16-alpine
```

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scaffold
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/scaffold
```

`docker stop scaffold-pg` / `docker start scaffold-pg` between sessions;
`docker rm -f scaffold-pg` to start over.

Either way, `pnpm db:migrate` afterwards, and `pnpm check` runs the database
tests instead of skipping them.

## Commands

```bash
pnpm dev              # every app, with hot reload
pnpm check            # lint + typecheck + test — run before pushing
pnpm build            # production build of every app
pnpm format           # Biome, writing fixes
pnpm test -- <file>   # one Vitest file
pnpm test:e2e         # Playwright, starts the app if none is running

pnpm db:generate      # new migration from a schema change
pnpm db:migrate       # apply migrations to DIRECT_URL
```

## Layout

```text
apps/web          Next.js application (App Router, Server Actions)
packages/db       Drizzle schema, client, migrations, test harness
packages/auth     Better Auth server config and session helpers
packages/ui       Untitled UI components, theme tokens, icon adapter
packages/env      Validated environment variables — the only reader of process.env
packages/config   Shared tsconfig and Biome config
e2e/              Playwright specs, run against a deployment
```

Each package ships TypeScript source; nothing is built to consume it. Inside a
package, `AGENTS.md` holds rules specific to that package.

## Environment

One `.env` at the repository root, loaded by every package and app.
`packages/env` validates it at startup and fails with a readable message when
a value is missing or malformed. `.env.example` is the reference; keep it in
sync when adding a variable.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled connection (Supabase port 6543) used at runtime |
| `DIRECT_URL` | Direct connection (port 5432) used by migrations |
| `BETTER_AUTH_SECRET` | Session signing key, ≥ 32 characters |
| `BETTER_AUTH_URL` | Public origin the app is served from |
| `CSP_REPORT_ONLY` | `true` downgrades the CSP to report-only; off by default |

## Testing

**Unit and integration — Vitest.** Every package with logic has a `test`
script; `pnpm check` runs them all. Pure tests need nothing. A test that
touches the database calls `setupTestTransaction()` from `@repo/db/testing`:

```ts
import { db, users } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";

setupTestTransaction();

it("stores the user", async () => {
  await signUp(...);                                   // code under test, importing `db` as usual
  expect(await db.select().from(users)).toHaveLength(1);
});
```

Each test runs inside a transaction that is rolled back afterwards, so tests
share one database — the one at `DATABASE_URL`, migrated — without sharing
state. The code under test is unchanged: the project's Vitest setup file
points `db` at the open transaction. Locally, with no database reachable,
these tests skip with a warning; in CI they fail.

**End to end — Playwright.** Specs live in `e2e/` and run against a real
deployment with a real database. `pnpm test:e2e` with no `BASE_URL` starts
`next dev` for you; with `BASE_URL=https://…` it targets that URL.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

1. `pnpm install --frozen-lockfile` — a lockfile that drifts is an unreviewed
   dependency change
2. `biome ci`, then `pnpm audit --audit-level=high` over everything and
   `pnpm audit --prod --audit-level=moderate` over what ships. The `--prod`
   pass also walks optional peer edges, which is how `better-auth` drags
   `vitest` and `drizzle-kit` into it; their dev-only advisories are listed
   in `auditConfig.ignoreGhsas` (`pnpm-workspace.yaml`) so the step stays
   meaningful. Remove an entry when the tool is upgraded past it.
3. `turbo run typecheck`
4. migrations, then `turbo run test`, against a Postgres service container
5. `turbo run build`

`.github/workflows/e2e.yml` is separate on purpose. It listens for GitHub's
`deployment_status` event, so it starts when Vercel reports the preview as
ready rather than racing a deployment that may not exist yet. It needs one
repository secret, `VERCEL_AUTOMATION_BYPASS_SECRET`, copied from the Vercel
project's Deployment Protection settings, so the browser can get past the
preview password. It runs for the web project's preview deployments only —
`Preview` while one Vercel project is linked, `Preview – scaffold-web` once
there are several; a different project name goes in the repository variable
`VERCEL_WEB_PROJECT`.

Turborepo runs tasks in strict environment mode: a variable reaches a task
only if `turbo.json` lists it. Adding a variable means adding it to
`packages/env`, `.env.example` and `globalPassThroughEnv`.

## Deployment

Vercel + Supabase. [docs/deployment.md](docs/deployment.md) is the checklist:
Supabase project and branching, the Vercel project (`apps/web` as Root
Directory), environment variables per environment, the automation bypass
secret for E2E, and what to verify. Migrations run as part of every deploy;
origins are trusted from Vercel's system variables. See ARCHITECTURE.md §12
for the cost ladder and the container escape hatch.

## Conventions in brief

- Route files are thin; logic lives in `apps/web/src/features/<name>`.
- Types are derived from the Drizzle schema, never written twice.
- Every Server Action authenticates first, validates with Zod, checks ownership.
- Every user-facing string is translated, in both locales, in the same change.
- Components come from `@repo/ui`; add missing ones with the Untitled UI CLI.
- Commits follow Conventional Commits; Lefthook runs Biome and commitlint.

The full list, with the reasoning, is in [AGENTS.md](AGENTS.md).
