# apps/docs

The documentation site: Fumadocs on Next.js, MDX under `content/docs`,
deployed as its own Vercel project (`scaffold-docs`, Root Directory
`apps/docs`). Port 3001 in development.

## One rule: code comes from the source, never from the clipboard

A code block that shows repository code is an `<include>`:

```mdx
<include lang="ts" meta='title="packages/auth/src/ownership.ts"'>../../../../packages/auth/src/ownership.ts#ownedBy</include>
```

- The path is relative to the MDX file. From `content/docs/*.mdx` the
  repository root is `../../../../`; one level deeper (`recipes/`,
  `decisions/`) it is `../../../../../`.
- `#name` includes only the part between `//#region name` and `//#endregion`
  in the source file. Add markers to the source when a whole file is too
  much; keep them few and named for what the block shows (`create`, `list`,
  `chain`).
- `__` in a path must be escaped as `\_\_` — the path is markdown-parsed and
  would otherwise become emphasis (`__tests__` → `\_\_tests\_\_`).
- A missing file or region fails the build. That is the feature: a moved
  file breaks the docs instead of leaving a stale sample behind.

Two pages are whole files from the repository: `architecture.mdx` includes
`ARCHITECTURE.md` and `deployment.mdx` includes `docs/deployment.md`. Edit
those, not the MDX.

## Structure

`meta.json` in each folder fixes the order. Sections follow ARCHITECTURE.md
§13: getting started, architecture, conventions, recipes, the example CRUD,
deployment, decision log. A new ADR copies the newest one and keeps its four
parts: context, decision, consequences, when to revisit.

## What the site is not

Not part of the design system: it uses Fumadocs' own Tailwind preset, not
`@repo/ui`. No database, no auth, no environment variables except the
optional `NEXT_PUBLIC_REPO_URL` for "view on GitHub" links.
