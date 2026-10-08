# App Scaffold — Architecture Blueprint

A production-ready starting point for building web applications fast, without
paying for infrastructure you don't need yet and without rewriting the
foundation when the project grows.

**Model:** single-tenant · monorepo · Next.js fullstack · Supabase Postgres + Drizzle

---

## 1. Design principles

1. **Zero fixed cost to start.** Every piece has a free tier that covers an MVP.
   Nothing requires a credit card on day one.
2. **No vendor lock-in at the data layer.** The app talks to Postgres through
   Drizzle, never through a proprietary SDK. Moving from Supabase to Neon, RDS
   or a self-hosted Postgres is a connection-string change.
3. **Feature-first, not layer-first.** Code is grouped by business capability,
   not by technical role. A feature can be deleted by removing one folder.
4. **The type system is the contract.** One Zod schema per entity, shared by
   the database layer, the server actions and the forms. No duplicated types.
5. **Boring where it matters.** Auth, migrations and caching use well-known
   libraries and documented patterns. Experiments happen in feature code, not
   in the foundation.

---

## 2. Stack

| Concern | Choice | Version (Sept 2026) | Why |
|---|---|---|---|
| Package manager | pnpm | 10.x | Fast, strict, first-class workspaces |
| Monorepo | Turborepo | 2.x | Incremental builds, native Vercel support |
| Framework | Next.js (App Router) | 16.3.x | Server Components + Server Actions |
| Language | TypeScript | 5.x, `strict: true` | — |
| UI | React | 19.x | React Compiler is stable in Next 16 |
| Styling | Tailwind CSS | 4.3.x | CSS-first config, no JS config file |
| Components | Untitled UI React (open source) | React Aria 1.20 | MIT, copy-in, 1:1 parity with the Figma kit |
| Primitives | React Aria | 1.20 | Accessibility baseline for anything hand-built |
| Icons | Hugeicons (free tier) | `@hugeicons/react` | 4,600+ Stroke Rounded icons, adapted in `packages/ui` |
| Database | Postgres (Supabase) | 16+ | Free tier, managed backups, storage included |
| ORM | Drizzle ORM | 0.45.x | Typed SQL, no binary engine, serverless-friendly |
| Migrations | drizzle-kit | 0.31.x | Versioned SQL files committed to the repo |
| Auth | Better Auth | 1.7.x | Sessions in your own Postgres, joinable with your tables |
| Validation | Zod | 4.x | Shared schemas via `drizzle-zod` |
| Forms | React Hook Form + `@hookform/resolvers` | latest | Works with Server Actions |
| Data fetching (client) | TanStack Query | 5.x | Only where client state is genuinely needed |
| Unit tests | Vitest | 3.x | — |
| E2E tests | Playwright | 1.x | — |
| Lint / format | Biome | 2.x | Replaces ESLint + Prettier, one tool, much faster |
| Git hooks | Lefthook | 1.x | Faster and simpler than Husky |
| Commits | Commitlint + Conventional Commits | — | Enables automated changelogs later |
| CI | GitHub Actions | — | Free for public repos, generous for private |
| Docs site | Fumadocs | latest | Next.js-native, MDX, lives in the same monorepo |
| i18n | next-intl | 4.x | App Router native, typed message keys |
| Caching | Next `cacheComponents` + tags | built-in | Invalidation by data, not by route |
| Email | Resend + React Email | latest | 3,000 emails/month free |
| Errors | Sentry | latest | Free tier is enough for an MVP |

**On the component layer.** Untitled UI React is used at its open-source tier
only. Base components, application UI and marketing sections are MIT-licensed
and free for unlimited commercial projects. The PRO tier adds advanced
components and 250+ page examples; it is not required and is not assumed
anywhere in this architecture. The decision driver is Figma parity: design
tokens map one-to-one between the Figma kit and the code, which removes the
translation step between design and implementation.

The consequence to accept: this is a React Aria codebase, not a Radix one.
Do not import shadcn/ui blocks or Radix-based components — mixing two primitive
layers duplicates focus management, portals and keyboard handling, and the
bundle pays for both.

**Deliberately excluded from the base:** tRPC (Server Actions cover the
single-app case), Redux/Zustand (added per project when needed), Prisma
(heavier runtime, generated client), Docker for local dev (Supabase CLI
handles it).

---

## 3. Repository structure

```
scaffold/
├── apps/
│   ├── web/                      # the application
│   │   ├── src/
│   │   │   ├── app/              # routes only — thin, no business logic
│   │   │   │   ├── (marketing)/  # public pages
│   │   │   │   ├── (auth)/       # sign-in, sign-up, reset password
│   │   │   │   ├── (app)/        # authenticated area
│   │   │   │   │   └── projects/ # example CRUD lives here
│   │   │   │   └── api/
│   │   │   │       └── auth/[...all]/route.ts
│   │   │   ├── features/         # ← the important folder
│   │   │   │   └── projects/
│   │   │   │       ├── actions.ts       # server actions (the write API)
│   │   │   │       ├── queries.ts       # read functions, server-only
│   │   │   │       ├── schema.ts        # Zod contracts for this feature
│   │   │   │       ├── components/      # feature-scoped UI
│   │   │   │       └── __tests__/
│   │   │   ├── components/       # app-level shared components
│   │   │   ├── lib/              # auth client, utils, constants
│   │   │   └── styles/
│   │   ├── e2e/                  # Playwright specs
│   │   └── next.config.ts
│   └── docs/                     # Fumadocs site, deployed separately
│
├── packages/
│   ├── db/                       # Drizzle schema, client, migrations, seed
│   │   ├── src/
│   │   │   ├── schema/           # one file per table + index.ts barrel
│   │   │   ├── client.ts
│   │   │   └── seed.ts
│   │   ├── migrations/           # generated SQL, committed
│   │   └── drizzle.config.ts
│   ├── auth/                     # Better Auth server config + client helpers
│   ├── ui/                       # Untitled UI components, icons, Tailwind preset
│   ├── email/                    # Resend transport, React Email templates, sendEmail()
│   ├── storage/                  # Supabase Storage provider, signed uploads, mime sniffing
│   ├── payments/                 # PaymentProvider interface + one adapter (§8)
│   ├── env/                      # typed, validated environment variables
│   └── config/                   # tsconfig, biome, tailwind base configs
│
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

### Dependency rules (enforced by lint)

```
apps/web          →  packages/db, auth, ui, storage, payments, env, config
packages/auth     →  packages/db, email, env, config
packages/email    →  packages/env, config
packages/storage  →  packages/env, config
packages/payments →  packages/env, config
packages/db       →  packages/env, config
packages/ui       →  packages/config
packages/env      →  (nothing internal)
```

No package may import from `apps/`. No circular dependencies. `packages/ui`
holds no business logic, so a second web app — an admin panel, a client
portal — can consume it unchanged. It is React Aria and Tailwind, so it is not
reusable in React Native; a mobile app would share `packages/db` and the
schema contracts, not the components.

---

## 4. Data layer

### Schema definition

`packages/db/src/schema/projects.ts`

```ts
import { isNull } from "drizzle-orm";
import {
  index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const projectStatus = pgEnum("project_status", [
  "draft",
  "active",
  "archived",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatus("status").notNull().default("draft"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // the list query filters by owner and status, and sorts by date
    index("projects_owner_status_idx").on(t.ownerId, t.status, t.createdAt),
    // partial: a deleted project must not block reusing its name
    uniqueIndex("projects_owner_name_uq")
      .on(t.ownerId, t.name)
      .where(isNull(t.deletedAt)),
  ],
);
```

**Soft delete has two consequences that are easy to miss.** Every unique
constraint on a soft-deletable table must be partial, or a user can never
recreate a record they deleted. And every read must filter `deletedAt IS NULL`
— which is why reads live in named query functions rather than being written
inline at each call site.

### Derived validation, never duplicated

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Allowlist with .pick(), never a denylist with .omit().
export const insertProjectSchema = createInsertSchema(projects, {
  name: (s) => s.min(2).max(120),
}).pick({ name: true, description: true, status: true });

export const updateProjectSchema = insertProjectSchema.partial();

// The exact shape that may leave the server. Never a raw row.
export const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

export type NewProject = z.infer<typeof insertProjectSchema>;
export type Project = z.infer<typeof selectProjectSchema>;
```

Change the column, and the form, the action and the types all fail to compile
in the same commit. That is the point.

**`.pick()` and not `.omit()` is a security rule, not a style choice.** A
denylist means every column added later is writable by default through the
forms that already exist. Add `role`, `credits` or `isVerified` to a table six
months from now and the existing create action will happily accept it from the
request body. An allowlist makes a new column unwritable until someone names
it. The same applies to what leaves the server: `projectColumns` is explicit,
so a column added later is not disclosed by accident.

**Where these live.** Schemas derived from a table sit next to that table in
`packages/db`, because `drizzle-zod` needs the table object and everything
downstream needs the result. Schemas that describe input the database does not
model — list filters, pagination params, a confirm-password field — live in
`apps/web/src/features/<name>/schema.ts`. There is no separate `validators`
package; it only created a third place to look.

### Migration workflow

```bash
pnpm db:generate     # drizzle-kit generate → new SQL file in migrations/
pnpm db:migrate      # apply to the target database
pnpm db:push         # local prototyping only, never in CI
pnpm db:studio       # Drizzle Studio
pnpm db:seed         # deterministic seed data for local + preview
```

Migrations are SQL files under version control. They run in CI against a
throwaway Postgres before merge, and against production as a deploy step.

### On Supabase specifically

Use Supabase for: managed Postgres, connection pooling, file storage,
scheduled backups, and realtime if a project needs it. Do **not** use the
`supabase-js` client for application queries — all reads and writes go through
Drizzle.

**Row Level Security is enabled on every table, with no permissive policies.**
Authorization is still enforced in the service layer, where it can be unit
tested — RLS is not doing the work. It is there so that if the anon key ever
reaches a browser, through Storage, a realtime subscription or a quick script
someone added later, the tables are closed by default instead of open. The
application connects with a role that bypasses RLS, so this costs nothing at
runtime. Leaving RLS off on a Supabase project is a bet that no one will ever
use a Supabase client feature; that bet tends to lose.

Connection: use the pooled connection string (port 6543, transaction mode) for
serverless runtime, and the direct connection (port 5432) for migrations.

---

## 5. Authentication

`packages/auth` wraps Better Auth so the rest of the codebase never imports it
directly. That single indirection is what makes auth replaceable.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db";

export const auth = betterAuth({
  // usePlural: the schema names tables `users` and `sessions` like every
  // application table, and Better Auth's models are singular.
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  emailAndPassword: {
    enabled: true,
    // verification, reset, the password-changed notice, token lifetimes:
    // all in ./email-flows, with the tests that drive them
    ...passwordOptions,
  },
  emailVerification: emailVerificationOptions,
  user: { additionalFields: userLocaleField },
  // storage must be "database": the default is per-instance memory, which on
  // serverless means no effective limit at all. customRules: the endpoints
  // that make the app send mail to any address get a tighter limit.
  rateLimit: { enabled: true, window: 60, max: 20, storage: "database", customRules: emailRateLimitRules },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  hooks: {
    before: singleUseVerificationTokens + beforePasswordReset,
    after: recordAuthEvent + afterPasswordChange,
  },
  // must stay last: makes getSession() behave inside a Server Component.
  plugins: [nextCookies()],
});
```

**Do not also set `rateLimit.modelName`.** With `usePlural` on, an explicit
model name is pluralised on top of itself and the adapter looks for
`rateLimitss` — which typechecks, and then throws the first time a request is
actually rate limited. There is a test pinning this.

**Email verification is required** (`REQUIRE_EMAIL_VERIFICATION`, default
true; `false` is the escape hatch for a preview without a mail provider). A
sign-up creates the account and sends a link; no session is issued until the
link is used. The link is a 24-hour JWT made single-use by a tombstone — the
token's hash, reserved in the verifications table the first time it is seen
(`reserveVerificationValue`, first writer wins on the primary key). A reset
link is a 1-hour token Better Auth stores and consumes atomically; before it
is consumed, every other outstanding reset token for the same user is
deleted, and a signed-in password change deletes them all as well. Both
changes send a password-changed notice to the address on file, in the
account's locale (`users.locale`, set at sign-up) rather than the request's —
a stranger resetting the password does not pick the language the owner is
warned in. `/send-verification-email` and `/request-password-reset` have
their own per-IP rate limit: they make the app send mail to any address, which
is a way to spam third parties, and the general auth limit is sized for
someone using the app. Sends are deferred past the response with `after()`;
see `packages/email`.

**Social providers are not wired yet.** Adding Google means adding
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `packages/env`, which makes
them required at boot and breaks a fresh clone until someone creates an OAuth
app. It belongs in the change that actually needs it, alongside the sign-in
button.

Generate the auth tables into the Drizzle schema and commit them like any
other table. The `@better-auth/cli` release train lags the library, so the
schema in `packages/db/src/schema/auth.ts` was derived from Better Auth's own
`getAuthTables()` for this project's options rather than from the CLI, with
two deliberate departures: plural snake_case names, and `timestamptz` instead
of the generator's bare `timestamp`, which silently drops the offset.

Sessions and users live in your Postgres, which means a project can be joined
directly against application tables — no cross-service lookups.

**Prepared but disabled:** the `organization` plugin is installed and its
tables are defined behind a feature flag. A single-tenant project ignores it.
A project that later needs teams turns it on without a data migration.

**Authorization pattern:** every server action starts with the same guard.

```ts
const session = await requireSession();          // throws → redirect to sign-in
const project = await requireProjectOwner(id, session.user.id);
```

Never trust an ID coming from the client. Ownership is verified server-side on
every mutation, in one shared helper that has its own tests.

`requireSession()` redirects by throwing, which is how `redirect()` works in
Next. Never wrap it in a broad `try/catch` — a catch-all swallows the redirect
and the request continues as if the user were authenticated.

**Middleware is not an authorization boundary.** It redirects unauthenticated
users for the sake of UX, and nothing more. Every action and every query
re-checks the session itself. This redundancy is deliberate: CVE-2025-29927
was a header that skipped Next middleware entirely, and any app that had
delegated authorization to it was wide open. Next 16 is not affected, but the
class of bug recurs. Never remove a session check because "the middleware
already handles it".

**Reads are authorized in the `WHERE` clause, not in an `if`.**

```ts
const project = await db.query.projects.findFirst({
  columns: publicProjectColumns,
  where: and(
    eq(projects.id, id),
    eq(projects.ownerId, session.user.id),
    isNull(projects.deletedAt),
  ),
});
if (!project) notFound();
```

Scoping the query cannot be forgotten the way a follow-up check can, and a
missing row returns 404 rather than 403 — which does not confirm to an attacker
that the record exists.

---

## 6. Application architecture

Four layers, top to bottom, each only calling the one below it:

```
Route (app/)          →  layout, params, Suspense boundaries. Almost no logic.
Feature UI            →  presentational components + forms
Actions / Queries     →  auth guard, validation, orchestration, revalidation
Data access (@repo/db)→  Drizzle queries
```

### The mutation pattern

Every write follows the same six steps, which makes the code predictable and
easy to review:

```ts
"use server";

export async function createProject(_: ActionState, formData: FormData) {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate — parseFormData keeps multi-value fields as arrays and
  //    coerces numbers, dates and booleans. Object.fromEntries does neither.
  const parsed = insertProjectSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 3. authorize (here: any signed-in user may create)

  // 4. execute — return named columns, never the whole row
  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, ownerId: session.user.id })
    .returning(projectColumns);

  // 5. invalidate — by tag, never by path. See "Caching" below.
  updateTag(cacheTags.projects(session.user.id));

  // 6. respond
  return { ok: true, data: project };
}
```

Consumed with `useActionState` + `useFormStatus`. No API route, no client
fetch, no manual loading state.

`parseFormData` lives in `apps/web/src/lib/form.ts`. It exists because
`Object.fromEntries(formData)` silently collapses repeated fields — every
multi-select and checkbox group — to their last value, and hands every field
over as a string.

### Caching and invalidation

`cacheComponents` is enabled. Read functions are cached and tagged; mutations
invalidate by tag.

```ts
// packages/db or feature queries.ts
async function listProjects(userId: string) {
  "use cache";
  cacheTag(cacheTags.projects(userId));
  return db.query.projects.findMany({ ... });
}
```

**Cached functions must be pure functions of their arguments.** Never read
`cookies()`, `headers()` or the session inside a `"use cache"` block. Any
per-user data takes the user id as an explicit parameter and includes it in the
tag, as above. A cached function that derives the user from request context
caches one user's data and serves it to the next — an authorization failure
that no permission check will catch, because the code is correct and the cache
is wrong. This is the sharpest edge of enabling `cacheComponents`.

**Request data needs a Suspense boundary, or the build fails.** With
`cacheComponents` on, reading `cookies()`, `headers()`, `params`,
`searchParams` or the session outside a `<Suspense>` is a build error, not a
warning — Next refuses to prerender the route and says so. This is the rule
that shapes every page in practice: the route file renders a static shell and
puts the part that depends on the request behind a boundary, which is what the
"Suspense boundaries" in the layering table above means. A page that genuinely
cannot be split — every byte of it depends on the session — declares
`export const instant = false` and blocks. Reach for that only when it is true;
reaching for it to silence the error throws away the static shell.

**Never invalidate by path.** With a `[locale]` segment and route groups, the
real route is `/[locale]/(app)/projects`, so `revalidatePath("/projects")`
matches nothing and fails silently — the English user sees their new record and
the Spanish user does not. Tags describe the data, so they are immune to route
structure, locale and folder moves.

Tag names come from `cacheTags`, a small module of functions. No raw tag
strings anywhere, for the same reason no raw paths: a typo is invisible.

Use `updateTag` in server actions when the user must see their own change
immediately. Use `revalidateTag(tag, "max")` for background staleness where
serving slightly old data is fine. `revalidateTag` with no second argument is
deprecated. `revalidatePath` remains only for pages with no tagged data behind
them.

### Server Actions are public endpoints

Every exported async function in a `"use server"` file is a callable HTTP
endpoint. It can be invoked directly, with any payload, by anyone who reads
the client bundle. The authenticate-validate-authorize prefix is not a style
convention, it is the security boundary.

Consequences to hold onto:

- Never export a helper from an actions file. Non-exported functions are not
  reachable; exported ones are. Helpers go in a separate module.
- Never rely on the UI to constrain input. A disabled field, a hidden input and
  a filtered select do not exist on the server.
- Auth endpoints are rate limited by Better Auth, but only when they are
  reached through its HTTP handler. The limiter and the origin check live in
  the router, so calling `auth.api.signInEmail()` directly from a Server Action
  skips both — sign-in becomes unlimited, which is the one endpoint that must
  not be. Measured, not assumed: with `max: 3`, ten direct `auth.api` calls
  were limited zero times and ten through the handler returned 429 seven times.
  `packages/auth` exposes `callAuthEndpoint`, which dispatches through the
  handler and forwards the resulting cookies; use it, and never reach for
  `auth.api.*` to perform a mutation.
- Actions that send email, trigger a job or hit a paid API need their own
  limit.
- Server Actions get CSRF protection for free: Next validates the request
  Origin against the Host. Route handlers do not. That is the second reason
  route handlers exist only for webhooks — and a webhook means signature
  verification plus an idempotency key, with no exceptions.
- Behind a custom domain or a proxy, set `serverActions.allowedOrigins` in
  `next.config.ts` or the origin check will either fail or be too permissive.

### Error handling

- `AppError` base class with `code`, `httpStatus` and a user-safe `message`.
- Actions return a discriminated union, they don't throw for expected failures.
- Unexpected errors bubble to `error.tsx` and are reported to Sentry.
- No raw database error ever reaches the browser.

---

## 7. Internationalization

Included in the base, not added later. Retrofitting i18n into a finished app
means touching every component that renders a string, which is the single most
tedious migration in frontend work. Carrying it from the start costs a wrapper
and a discipline.

**Library:** next-intl. **Locales:** `en` and `es`, with the default set in one
config file per project.

**Routing:** locale prefix, `as-needed` mode. The default locale serves clean
URLs (`/projects`) while the other is prefixed (`/es/projects`). Both are
crawlable and `hreflang` tags are emitted automatically.

**Structure:**

```
apps/web/
├── messages/
│   ├── en.json          # namespaced by feature: { "projects": { ... } }
│   └── es.json
└── src/
    ├── i18n/
    │   ├── routing.ts   # locales, default, prefix strategy
    │   └── request.ts
    └── app/[locale]/    # every route lives under this segment
```

**Rules that keep it maintainable:**

- Message keys are namespaced by feature and typed. A missing key is a build
  error, not a runtime `projects.title` rendered on screen.
- Dates, numbers and currency go through `useFormatter`, never manual string
  building. `Intl` handles the differences between `1,234.56` and `1.234,56`.
- Database columns store codes, not display text. A project status is
  `"active"` in the database and is translated at render time. Never store a
  translated string in a column that the UI reads directly.
- Emails receive the recipient's locale as a parameter. The templates are
  translated the same way as the UI.
- Zod carries a localized error map, so validation messages arrive in the
  user's language without per-field wiring.
- `setRequestLocale` is called in every layout so pages stay statically
  renderable.

**Middleware composition:** one explicit chain — locale, then the auth
redirect, then the CSP and security headers. This is the one piece that has to
be written carefully once; after that, nothing touches it.

Each step depends on the one before it:

1. **Locale** runs first because the later steps need the language. next-intl
   may answer with a redirect of its own (`/en` normalizes to `/`), and it
   rewrites `/sign-in` to the internal `/en/sign-in`, so anything reading the
   path afterwards would read the rewritten one — the auth step works from
   `request.nextUrl` for that reason.
2. **Auth redirect** runs second because it builds a localized URL: a Spanish
   visitor must land on `/es/sign-in`, not `/sign-in`. It is skipped when step
   1 already produced a redirect, since that response comes back through the
   middleware and gets checked then.
3. **CSP and security headers** run last because they decorate whatever the
   first two produced, redirects included — a redirect still needs HSTS and
   nosniff.

The nonce is the exception to the ordering, and the part most likely to be
broken by a later edit: its *value* is minted at the top, before step 1, even
though it is applied in step 3. Next stamps the nonce onto its script tags by
reading it from the **request** headers, and next-intl copies those headers
onto the response it builds in step 1. Mint it in step 3 and it never reaches
the request, so no script tag ever carries it.

The auth step checks only that a session cookie is *present*. It does not
validate it, because that is a database round trip on every request in the edge
runtime and it would buy nothing — middleware is UX, and the page's own
`requireSession()` is the boundary. Route groups do not appear in the URL, so
membership of `(app)` is declared as an explicit prefix list in
`lib/routes.ts`; a route added there without an entry is still safe, just not
redirected early.

**On the file name:** Next 16.3 deprecates `middleware.ts` in favour of
`proxy.ts` and warns on every build. It is a rename with the same API
(`npx @next/codemod middleware-to-proxy`). This document and the code both
still say middleware; change them together or not at all.

**Known issue: the 404 is not translated.** An unmatched URL matches no route,
so Next falls back to the root `app/not-found.tsx`, which sits outside
`[locale]`. `/es/nope` therefore answers in English with `lang="en"`, and
`app/[locale]/not-found.tsx` never renders at all.

The usual remedy — an `app/[locale]/[...rest]/page.tsx` that calls
`notFound()` — does not work under `cacheComponents`, and was tried and
reverted. Two things go wrong. The catch-all always throws, so Next cannot
validate its `instant` contract, which `export const instant = false` settles.
What it does not settle is the boundary render: reaching
`[locale]/not-found.tsx` re-renders `[locale]/layout.tsx`, whose
`await params` is runtime data on a route that matched nothing, so the layout
fails to prerender and Next serves an empty error shell — strictly worse than
an English page.

A real fix has to let `[locale]/layout.tsx` render without a statically known
`params`, and it needs the layout for `<html lang>`. Worth solving; not worth
shipping a blank page over.

`app/global-error.tsx` is a separate and deliberate exception: it replaces the
root layout when a layout throws, so it must not depend on next-intl
resolving, since next-intl may be what threw.

**Adding a locale is two edits.** A new `messages/<locale>.json` and one entry
in `routing.ts`. No new routes, no new components, no per-locale branches
anywhere in the codebase — `[locale]` is a wildcard, not a list that gets
duplicated. The only thing that grows per language is the message file, which
is unavoidable in any stack because someone has to write the translations.

Translated URL segments (`/es/proyectos` instead of `/es/projects`) are the one
feature that does add per-locale configuration: a pathname map. It is off by
default. Turn it on only when public SEO in that language is worth the upkeep;
for anything behind a login it buys nothing.

**Content translation is out of scope.** This handles interface strings. If a
project needs user-generated content in multiple languages, that is a schema
decision (a `jsonb` column or a translations table) made per project.

---

## 8. Payments

Not in the base. Most projects don't charge money, and an unused payment module
is dead code that still has to be maintained and audited.

When a project does need it, `packages/payments` gets created with a
`PaymentProvider` interface and one adapter. The interface exists so the choice
of provider is a per-project decision rather than an architectural one:

- **Tilopay** for the Costa Rican and Central American market. Local acquiring,
  SINPE Móvil, local cards, tokenization for recurring charges, and a sandbox
  with developer credentials. Approval rates on local cards are meaningfully
  better than routing through an international processor.
- **Stripe** for international customers and pure SaaS subscriptions.

Both are webhook-driven, so the shared pattern is the same regardless of
provider: a route handler that verifies the signature, an idempotency key, and
a state machine on the order or subscription record. That pattern gets written
once, in whichever project needs it first, and then it moves into the scaffold.

---

## 9. The example CRUD

A complete, working `projects` feature ships in the repo. Full stack, not a
UI mockup with fake data — it runs against the real database on a fresh clone
after `pnpm db:migrate && pnpm db:seed`.

**Database layer**
- `projects` table with a status enum, an owner foreign key, soft delete and
  timestamps
- generated migration committed to the repo
- seed script producing a deterministic set of records for local and preview
  environments
- indexes on the columns the list query actually filters and sorts by

**Contract layer**
- insert, update and filter schemas derived from the table via `drizzle-zod`
- types exported from a single place and consumed everywhere

**Server layer**
- `queries.ts`: paginated list with search and status filter, single record
  fetch, ownership check helper — all `server-only`
- `actions.ts`: create, update, delete, restore — each following the six-step
  mutation pattern
- unit tests covering validation failure, unauthorized access and the happy
  path

**UI layer**
- data table built on TanStack Table with the Untitled UI base components,
  living in `packages/ui/src/composed/` so every future project inherits it
- URL-driven filters via `nuqs`, so a filtered view is shareable and the back
  button behaves
- create and edit forms with React Hook Form, inline validation and pending
  states from `useFormStatus`
- delete confirmation dialog with an undo toast
- empty state, error state, unauthorized state and loading skeleton
- fully translated in both locales

**End to end**
- one Playwright spec covering sign in → create → edit → filter → delete

Every pattern the scaffold recommends appears at least once here. When a
convention and this feature disagree, the feature wins, because it is what
gets copied.

---

## 10. Security baseline

Everything here ships in v0.1. Security added later is security that never
gets added.

### Headers and CSP

The middleware already runs for locale handling, so the marginal cost of
adding a nonce-based Content Security Policy there is small. The baseline:

```
Content-Security-Policy      script-src 'self' 'nonce-<generated>' 'sha256-<react shell script>'
Strict-Transport-Security    max-age=63072000; includeSubDomains; preload
X-Content-Type-Options       nosniff
Referrer-Policy              strict-origin-when-cross-origin
Permissions-Policy           camera=(), microphone=(), geolocation=()
X-Frame-Options / frame-ancestors 'none'
```

`frame-ancestors` is the clickjacking defense; set it to `'none'` unless the
app is meant to be embedded.

**`strict-dynamic` is deliberately absent, and cannot be added while
`cacheComponents` is on.** The two are incompatible, which is not obvious until
the app fails to boot:

`strict-dynamic` tells the browser to ignore every host-source expression,
`'self'` included, and to execute only scripts carrying the nonce. Next stamps
that nonce onto its script tags by reading it from the request's CSP header —
which exists only for HTML rendered per request. With `cacheComponents` enabled
the shells are prerendered at build time, when there is no request and no
nonce, so their script tags ship without one. Under `strict-dynamic` every
script on a prerendered page is then refused and nothing runs. Verified against
a build: a fully dynamic route gets nonced tags, a prerendered or partially
prerendered one does not.

Without `strict-dynamic`, `'self'` and the nonce are alternatives rather than
one overriding the other. Prerendered tags are allowed by `'self'`, dynamic
ones by either, and — the part that actually stops XSS — an injected inline
script is still refused, because there is no `'unsafe-inline'` and the nonce
cannot be guessed. What is given up is `strict-dynamic`'s real job: letting one
trusted script pull in others without maintaining a host allowlist. A project
that loads no third-party scripts has no allowlist to maintain and loses
nothing.

The nonce is still generated and still plumbed through, because it is what
makes any future inline script safe to add, and because the cost is one line.

**Two things follow from "prerendered shells have no nonce", and both are
handled.** First, the shell is not only external script tags: React writes one
inline script into it, a shell-time marker (`$RT=performance.now()`), and
`'self'` does not cover inline. It is allowed by the hash of its exact text —
a hash admits that script and nothing else — with a TODO pointing at
vercel/next.js#89754 for the day Next stamps nonces onto prerendered inline
scripts. Second, and more serious: a *fully* static page inlines its RSC
flight data into the shell too, also without a nonce, so the browser refuses
it and the page never hydrates — silently, because forms still post without
JavaScript. Every route under `[locale]` therefore has a request-time boundary
in the layout (`RequestBoundary`, a `<Suspense>` around `connection()`), which
makes every page partially prerendered: the shell stays static, and the flight
data streams per request with the nonce on it. Removing that boundary, or
adding a page outside the `[locale]` layout, brings the bug back; the check is
`.next/server/app/<route>.html` containing no `self.__next_f.push` script.

Getting `strict-dynamic` back means rendering every page dynamically
(`export const instant = false` throughout), which is the opposite of what
enabling `cacheComponents` was for. If a project genuinely needs it — a CMS
embed, a tag manager, anything that injects scripts at runtime — that is the
trade to make consciously, in a pull request, not by adding the token and
assuming it works.

**The CSP is enforced, not report-only.** A fresh project loads no third-party
scripts, so there is nothing for it to break. The first time it does break will
be the moment someone adds an analytics or chat widget — which is exactly when
you want to be asked. `CSP_REPORT_ONLY=true` exists as a documented escape for
a project that must ship with a stubborn third-party embed; it is off by
default and turning it on is a decision that belongs in a pull request, not in
someone's local setup.

### Secrets

`packages/env` declares server and client variables in separate schemas.
`@t3-oss/env-nextjs` then fails the build if a server variable is referenced
from client code. This is a security control, not a convenience — it is what
stops a database URL from being inlined into a bundle.

- `NEXT_PUBLIC_` means public. Anything under that prefix is in the browser
  bundle and readable by anyone.
- **Edge code imports `@repo/env/edge`, never `@repo/env`.** The main schema
  declares `DATABASE_URL` and `BETTER_AUTH_SECRET` as required, so importing it
  from the middleware drags the whole server schema into the edge bundle: the
  middleware then refuses to start without a database URL it never uses, and a
  secret sits one bundling mistake away from a runtime it does not belong in.
  The edge schema carries only what edge code may read, and everything in it
  has a default so it validates with nothing set. The same split exists in
  `@repo/auth/edge`, for the same reason.
- The root `.env` is loaded by `@repo/env` itself, using `process.loadEnvFile`
  with no imports so the module stays edge-safe. One file at the repository
  root serves the app, drizzle-kit, the tests and the scripts, each of which
  runs with a different working directory. Values already in the environment
  win, so a deployment's real variables are never shadowed.
- The seed script asserts that the connection host is local before it runs.
  Seeding a client's production database is a one-line mistake otherwise.
- `db:push` and Drizzle Studio never point at production.

### Error reporting

Sentry sends request bodies by default. Server Action payloads include
passwords on sign-in and personal data everywhere else, so PII scrubbing is
configured before the DSN is added, not after the first incident.

Errors surfaced to the user carry a code and a safe message. Database errors,
stack traces and the parsed input are never echoed back.

The full setup above (`instrumentation.ts`, `withSentryConfig`, client-side
init) is still outstanding — see the v0.4 roadmap. What exists today is
narrower: `apps/web/src/lib/sentry.ts` lazily calls `Sentry.init()` the first
time a scheduled job fails, so a cron job's thrown error reaches Sentry
instead of only ever being a 500 nobody is watching. See "Scheduled jobs"
below.

### Scheduled jobs

Every job lives in `apps/web/src/jobs/` as a route handler under
`app/api/jobs/<name>/`, built from one shared wrapper
(`createCronJobHandler` in `run-job.ts`) that does four things before or
after the job's own logic runs: rejects a call with no valid
`Authorization: Bearer $CRON_SECRET` with 401, logs the start and the
outcome, caps the batch a single invocation may touch
(`MAX_JOB_BATCH_SIZE`), and reports a thrown error to Sentry.

The job itself is a plain function — `purgeStalePendingFiles` in
`apps/web/src/features/files/` is the one example today — that takes a limit
and returns how many rows it touched, with no knowledge of HTTP or the
schedule. Idempotent by construction: once every row matching the cutoff is
gone, the next call's `WHERE` finds nothing. A backlog larger than the cap
clears over several ticks of the Vercel Cron schedule in
`apps/web/vercel.json`, not in one call that risks the function timeout.
There is no auth-event retention job any more — see "Audit log" below for
why a time-based delete and an append-only table cannot coexist.

This is deliberately the "smallest correct version" from the "Add a
background job" recipe, not the job-queue system the recipe describes for
work that outlives a request (a `jobs` table, enqueue-from-an-action,
`FOR UPDATE SKIP LOCKED`). Reach for that only when a feature actually needs
it.

### Authentication hygiene

- Sign-in and password reset respond identically whether or not the account
  exists. A helpful "no account with that email" is a user enumeration oracle.
- Auth events are logged from day one, into `audit_log` — see "Audit log"
  below. Written today: **sign-in, failed sign-in, password change**, each
  as an `action` like `"auth.sign_in"`. `AuthAction` also declares
  `"auth.email_change"` and `"auth.session_revoked"` ahead of the features
  that raise them, because an audit trail missing events for the weeks
  nobody noticed is the failure this table exists to prevent.
- Events are written in one Better Auth `after` hook rather than at each call
  site, so a new sign-in path cannot be added without one. The hook reads
  `context.returned`: a rejected endpoint reaches it carrying an `APIError`,
  which is what makes a failed sign-in observable at all. It never throws —
  refusing to authenticate a legitimate user because an audit insert timed out
  is the wrong trade.
- A failed sign-in is logged with a **null** actor id, deliberately. Resolving
  the submitted email to an account would mean an existence check on every
  failed attempt, which is precisely the enumeration oracle the sign-in
  response is careful not to be. The IP, user agent and timestamp are what a
  credential-stuffing investigation actually reads.
- Full IPs, not hashed: a hash cannot tell you the login came from a
  different country, which is the question you actually ask during an
  incident. There is no retention window — see "Audit log" below.
- IPs are recorded only when trustworthy. Better Auth discards a multi-hop
  `X-Forwarded-For` rather than believing it, because every value in it can be
  set by the client. Behind a load balancer, set
  `advanced.ipAddress.trustedProxies` or the column stays null in production.
- Sessions are httpOnly, `sameSite: lax`, and `secure` derived from the
  scheme in `BETTER_AUTH_URL` — hardcoding `secure: true` means the browser
  drops the cookie over plain-http localhost and sign-in appears to do nothing.
- **Password changes do not yet revoke other sessions.** Better Auth takes
  `revokeOtherSessions` as a caller-supplied flag on `changePassword`, so this
  lands with the change-password UI.

### Audit log

`audit_log` generalizes what was `auth_events`: actor, action, entity type
and id, a field-level diff, timestamp, IP and user agent — one table for
every security event and every admin action, not two tables that drift.
`action` is a free-form string (`"auth.sign_in"`, `"admin.user.viewed"`)
rather than a Postgres enum; the set of actions grows with every admin
feature, and an enum would mean a migration for each one.

- **`appendAuditLog()`, in `packages/db/src/audit.ts`, is the only writer.**
  No function in the codebase updates or deletes a row here — enforced by a
  test that scans every package and app's source for `.update(auditLog)` or
  `.delete(auditLog)` (`packages/db/src/__tests__/audit-log-append-only.test.ts`),
  since the table has no RLS or trigger standing in the way of a mistake. It
  is a regex scan, not a type system — it would miss a renamed import — and
  it is not pretending to be more than a best-effort guard against the
  straightforward mistake: a future "undo" or "redact" feature reaching for
  `db.update(auditLog)`.
- **No retention job, on purpose.** `auth_events` used to delete rows after
  90 days. Generalizing it into an append-only audit log retired that job —
  "deletes rows older than N days" and "nothing in application code ever
  deletes a row here" cannot both be true of the same table, and an
  accountability trail for admin actions is not the kind of record you want
  to age out on a timer. If IP/user-agent retention becomes a compliance
  requirement later, the answer is a separate, explicit decision — not
  quietly bringing deletion back.
- **Written in the same transaction as the change it describes**, from the
  action layer, never from a database trigger. `updateUserAsAdmin` (see
  "Admin panel" below) reads the row, computes the diff, writes the update,
  and appends the audit row inside one `db.transaction()` — a crash between
  the update and the audit write cannot leave one without the other.
- **A diff is `{field: {old, new}}` for only the fields that actually
  changed** (`diffFields()` in `packages/db/src/audit.ts`), never the whole
  row. A read (an admin viewing a record) carries `diff: null`, not an empty
  object standing in for "nothing happened."

### Admin panel

A `(admin)` route group with its own authorization boundary — a role check,
not the ownership scoping every other mutation in this app uses.

- **`requireAdmin()`** (`packages/auth/src/admin.ts`) is the whole boundary:
  no session, a signed-in non-admin, and an admin whose role was since
  revoked all get `notFound()`, identically. Not a redirect to sign-in —
  that would itself be the "login prompt" an admin route must never show,
  including to a visitor with no session at all. Called from
  `(admin)/layout.tsx` for rendering, and again from every admin Server
  Action, because a layout guards pages, not the action functions a crafted
  request could call directly.
- **`users.role`** is a Better Auth additional field registered with
  `input: false` — unlike `locale`, nothing a request body sends can ever
  set it. The only way to grant or revoke admin is a direct database write
  from `updateUserAsAdmin`, never through Better Auth's own API.
- **No ownership check in the admin mutation.** `updateUserAsAdmin` acts on
  any user's record by id; `requireAdmin()` is the only gate. This is the
  one mutation in the app where that is correct rather than a bug.
- **Every admin read of personal data writes an audit row**, which is why
  `listUsersForAdmin()` and `getUserForAdmin()` (`apps/web/src/features/
  admin/queries.ts`) are deliberately not `"use cache"`: a cache hit would
  mean a second admin viewing the same record inside the cache's lifetime
  leaves no trace, which defeats the point of logging the view at all. The
  cost is a query on every read; the admin section is not the hot path a
  cache tag exists to protect.

### Supply chain

- CI installs with `--frozen-lockfile`. A lockfile that drifts in CI is an
  unreviewed dependency change.
- `pnpm audit` runs as a pipeline step.
- pnpm 10 blocks install lifecycle scripts by default and requires an explicit
  `onlyBuiltDependencies` allowlist. Do not disable this for convenience — it
  is the cheapest defense available against a compromised package.
- Renovate keeps dependencies current; stale is its own vulnerability.

### Deployment exposure

Vercel preview URLs are publicly reachable. Deployment Protection is enabled,
and preview databases are seeded with synthetic data only. A preview branch
carrying a client's real records is a breach with a link.

---

## 11. Tooling and quality gates

```jsonc
// package.json (root)
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    // one command before pushing; each workspace defines its own lint/test
    "check": "turbo run lint typecheck test",
    "format": "biome check --write .",       // root-level, not a turbo task
    "test:e2e": "playwright test",
    "db:generate": "turbo run db:generate -F @repo/db"
  }
}
```

**Pre-commit (Lefthook):** Biome on staged files, commitlint on the message.
Fast, under two seconds. Slow checks belong in CI, not in the hook.

**CI pipeline** on every pull request:

1. install with `--frozen-lockfile` (pnpm cache)
2. `biome ci` — lint + format, plus `pnpm audit`
3. `turbo run typecheck`
4. `turbo run test` — Vitest, with a Postgres service container. Each test runs
   inside a transaction that is rolled back, so tests share one database
   without sharing state.
5. `turbo run build`
6. Playwright — see below

The E2E job does not run in the same sequence as the rest. It is triggered by
GitHub's `deployment_status` event, so it starts when Vercel reports the
preview as ready. Chaining it after `build` in the main job means racing a
deployment that may not exist yet, which produces intermittent red builds that
nobody trusts and everyone reruns.

**Environment variables** are validated at boot by `packages/env` using
`@t3-oss/env-nextjs`. A missing or malformed variable fails the build with a
readable message instead of producing `undefined` at runtime. `.env.example`
is committed and kept in sync; the real `.env` never is.

---

## 12. Deployment

| Stage | Setup | Monthly cost |
|---|---|---|
| Development | Supabase local via CLI, `pnpm dev` | $0 |
| MVP / demo | Vercel Hobby + Supabase Free | $0 |
| First paying client | Vercel Pro + Supabase Pro | ~$45 |
| Scale | Vercel Pro + dedicated Postgres (Supabase/Neon/RDS) | usage-based |

Two Vercel projects point at the same repository, distinguished by Root
Directory: `apps/web` and `apps/docs`. Turborepo's remote cache means an
unchanged app is not rebuilt. Preview deployments get their own database
branch so pull requests never touch production data.

The click-through setup is [docs/deployment.md](docs/deployment.md). What the
repository contributes: `apps/web/vercel.json` runs `drizzle-kit migrate`
before `next build` on every deploy, against that environment's `DIRECT_URL`,
so a schema change and the code that needs it ship together or not at all;
`packages/env` defaults `BETTER_AUTH_URL` to the deployment's own URL on
Vercel and exposes `deploymentOrigins()`, which both Better Auth's origin check
and Next's `serverActions.allowedOrigins` read — one list, so the two cannot
disagree. Production behind a custom domain sets `BETTER_AUTH_URL` explicitly.

**Escape hatch:** if a client requires their own infrastructure,
`turbo build --filter=web` produces a Next.js standalone output that
containerizes with a ten-line Dockerfile and runs anywhere.

---

## 13. Documentation site (`apps/docs`)

Fumadocs, MDX content, deployed as a separate Vercel project. Sections:

1. **Getting started** — clone, `pnpm install`, environment setup, first run
2. **Architecture** — this document, kept current
3. **Conventions** — naming, folder rules, commit format, PR checklist
4. **Recipes** — add a table, add a feature, add a protected route, add an
   email, add a background job
5. **The example CRUD** — annotated walkthrough of the `projects` feature
6. **Deployment** — Vercel setup, environment variables, migration strategy
7. **Decision log (ADRs)** — why Drizzle over Prisma, why Server Actions over
   tRPC, why Better Auth over Supabase Auth

Code blocks in the docs are pulled from the real source files, so they can't
drift out of date.

---

## 14. Using it as a scaffold

Three viable mechanisms, in order of effort:

1. **GitHub template repository** — zero work, "Use this template", then a
   `setup` script renames the project, rewrites the README and clears git
   history. Good enough to start.
2. **`create-<name>-app` CLI** — a small package that prompts for project
   name, database provider and optional modules (payments, email, org
   support), then writes only the selected pieces. Worth building after three
   or four projects, once you know what actually varies.
3. **Long-lived upstream** — keep the scaffold as a git remote so existing
   projects can pull foundation fixes. Powerful, but demands discipline about
   what belongs upstream.

Start with 1, move to 2 when the manual steps become annoying.

**Removing the example feature.** Whichever mechanism runs the setup script,
deleting `projects` (§9) is not just deleting `features/projects`, its routes,
its table and migration, and its message keys. Two shared files carry entries
scoped to it that nothing enforces except a human remembering to look:
`apps/web/src/lib/routes.ts` and `apps/web/src/lib/cache-tags.ts`. A stale
`cacheTags.projects`/`cacheTags.project` export is dead code — harmless, easy
to spot later. A stale path export in `routes.ts` is not: an audit found the
dashboard's `href="/projects"` written as a plain string outside that file,
which went undetected because typedRoutes was silently inactive (see the
`tsconfig.json` note in §4's sibling discussion of generated types), and
`pnpm check` — lint, typecheck and the full test suite — passed anyway with a
dead link shipped. With typedRoutes correctly wired and `routes.ts` the only
file allowed to hold a path literal (see its own file header, and the rule in
AGENTS.md), the setup script's omission becomes exactly the failure it should
be: delete the feature, leave its entry in `routes.ts`, and the build does not
compile. Verified on a throwaway branch by deleting `features/projects` and
its routes and confirming `routes.ts` fails to build; the branch was discarded
and the example stays in the repo.

---

## 15. Roadmap

**v0.1 — foundation**
Monorepo, Next.js app, Drizzle + Supabase, Better Auth (email + password),
Tailwind v4 + Untitled UI, next-intl with en/es routing, Biome, CI,
env validation, security headers and auth event logging.

Built so far: monorepo and tooling, `packages/env`, `packages/db` with
migrations, `packages/auth`, `packages/ui` (Untitled UI base components, the
theme, the Hugeicons adapter), and `apps/web` with the middleware chain, the
`[locale]` segment, sign-in and sign-up on the shared components; the CI
pipeline with the transactional Vitest harness, Playwright on
`deployment_status`, and the Vercel deployment (migrations as a deploy step,
trusted origins, the setup checklist). Still outstanding in v0.1: Google
sign-in, the rest of Sentry (job failures report as of v0.4; request tracing
and `error.tsx` do not yet), and enabling Row Level Security in the
migrations (§4 states it as the baseline; the schema does not yet call
`.enableRLS()`).

**v0.2 — the reference feature**
Full `projects` CRUD end to end, shared data table, seed data, unit + E2E
tests, all states translated.

Built so far: the server layer (owner-scoped queries and the four actions,
tested in rolled-back transactions), the shared `DataTable` and `Toaster` in
`packages/ui/src/composed`, and the UI — list with URL-held filters, sort and
pagination (nuqs), create and edit forms (React Hook Form + `useActionState`),
delete with confirmation and undo, streamed detail page, empty, error and
not-found states, both locales, one Playwright spec through the whole flow.
Still outstanding in v0.2: seed data.

**v0.3 — documentation**
Fumadocs site, recipes, ADRs, contributor guide.

Built so far: `apps/docs` with the seven sections of §13, code samples
included from source at build time, six ADRs (Drizzle, Server Actions, Better
Auth, Untitled UI, cache tags, RLS). The email and background-job recipes
describe the intended shape and are marked as such until v0.4 lands.

**v0.4 — optional modules**
Payments (`PaymentProvider` interface with a Tilopay or Stripe adapter),
transactional email, background jobs, file uploads, audit log, admin panel.

Built so far: transactional email — `packages/email` (Resend behind one
`sendEmail()`, React Email templates for verification, reset and
password-changed, both locales), `users.locale` set at sign-up, verification
required with 24-hour single-use links, the reset flow with 1-hour single-use
tokens invalidated on use and on any password change, a separate rate limit
on the endpoints that make the app send mail, sends deferred past the
response with `after()`. File uploads — `packages/storage` (Supabase Storage
behind a `StorageProvider`, signed upload URLs, object keys never the client
filename, a magic-byte mime re-check on confirm, Storage RLS policies scoped
by path prefix), the `files` table (pending/ready, soft delete), a purge job
for pending rows whose upload never arrived, and the `FileUpload` composition
in `packages/ui` (progress, error and retry states). Payments —
`packages/payments` (`PaymentProvider` interface with a Stripe adapter:
Checkout Sessions, webhook signature verification, event-to-order mapping),
the `orders` and `processed_events` tables, one `transitionOrder()` function
gating every status change through a fixed transition table, the webhook
route handler as the sole fulfiller, and a checkout success page that reads
status from the database rather than trusting the redirect. Scheduled jobs —
`apps/web/src/jobs/` (one shared wrapper for the `CRON_SECRET` check, start/
outcome logging, the batch cap and Sentry reporting), wired to
`purgeStalePendingFiles` on a Vercel Cron schedule in `apps/web/vercel.json`;
see §10, "Scheduled jobs". Audit log and admin panel — `audit_log` generalized
from `auth_events` (actor, action, entity, a field-level diff), one
`appendAuditLog()` as the sole writer, enforced append-only by a repo-wide
scan rather than a trigger; `users.role` and `requireAdmin()` as the
authorization boundary for a new `(admin)` route group, returning the same
404 to a non-admin, a revoked admin, and a signed-out visitor alike; see §10,
"Audit log" and "Admin panel".

**v0.5 — automation**
`create-app` CLI, Renovate for dependency updates, release automation.
