# packages/ui

Shared design system: Untitled UI React components (copied in, MIT tier),
the Tailwind v4 theme they depend on, and the icon adapter. No business logic,
no i18n, no data access — anything that needs a session, a locale or a
database belongs in `apps/web/src/features`.

Read the root `AGENTS.md` first. These rules add to it.

---

## Layout

```
src/
  styles/globals.css     entry point — exported as @repo/ui/styles.css
  styles/theme.css       design tokens (@theme); mirrors the Figma kit
  styles/typography.css  .prose styles
  components/base/       Untitled UI components, one folder per component
  components/application/ Untitled UI application components (table)
  composed/              our own compositions of the above (DataTable)
  utils/cx.ts            tailwind-merge wrapper; use for every conditional class
  icons.tsx              the icon adapter — see below
  fonts.ts               Inter, self-hosted through next/font/local
  router.ts              React Aria RouterProvider re-export
```

`components/` is upstream code, copied in and lightly adapted. `composed/` is
ours: generic building blocks assembled from the primitives, with no knowledge
of any feature. A composition takes its data and every user-facing string as
props (each string with an English default); it never fetches and never
translates. New source folders need an `@source` line in `styles/globals.css`.

Consumers import by subpath, never through a barrel:

```ts
import { Button } from "@repo/ui/components/base/buttons/button";
import { Input } from "@repo/ui/components/base/input/input";
import { LogOut } from "@repo/ui/icons";
```

The paths are long because they are Untitled UI's. Keeping them means the CLI,
the docs and the Figma kit all agree on where a component lives.

---

## Adding a component

```bash
cd packages/ui
npx untitledui@latest add <name> -y
```

**Before running it: the CLI re-copies every component the new one depends
on, overwriting ours.** `add table` rewrote `button`, `input`, `label` and
`tooltip` and silently dropped every deviation listed below. Commit first so
`git diff` shows what it touched, then restore the deviations from that diff
(or from this file).

Then, every time:

1. **Delete what the auth pages did not ask for.** `add input` also drops
   `input-payment`, `pin-input`, `tags`, 60 payment icons and more. Keep the
   files the requested component imports and remove the rest. A component
   nobody renders is still a component someone has to review.
2. **Rewrite `@/` imports to `@repo/ui/`.** The CLI honors the alias for
   `utils/` but writes `@/components/...` for cross-component imports.
   `grep -rn '"@/' src` must come back empty.
3. **Swap `@untitledui/icons` for `@repo/ui/icons`.** Same names; if an icon is
   missing, add it to `icons.tsx` rather than importing the package.
4. **Install the dependencies the CLI could not.** It runs `npm install`, which
   fails on `workspace:*`. Read the versions from its error line and add them
   to `package.json` pinned exactly, then `pnpm install` from the root.
5. **`pnpm exec biome check --write .`** — the copied code uses a different
   formatter. Fix lint findings in the copied file rather than suppressing them,
   except `is-react-component.ts`, which needs `any` for its type guard and
   says so.
6. **Add the subpath to `exports` only if a new top-level folder appeared**
   (`components/*` and `utils/*` are already covered).

Do not hand-write a component that Untitled UI ships. Do not install Radix,
shadcn/ui or Headless UI — one primitive layer, React Aria.

### Deviations from upstream

Kept deliberately small so `add --overwrite` stays an option:

- Icon imports point at `@repo/ui/icons`.
- Decorative `<svg>` elements carry `aria-hidden="true"`.
- `Input` and `InputBase` take a `passwordToggleLabel` prop. The upstream
  component hardcodes an English `aria-label`; the app passes the translated
  string. Any new user-facing string in a copied component gets the same
  treatment — a prop with an English default, translated by the caller.
- `table.tsx` ships without `TableRowActionsDropdown` (an example with
  hardcoded strings that pulled in the dropdown, select and avatar trees).
- `badges.tsx` ships without `BadgeWithFlag` and `BadgeWithImage`: the flag
  variant loads images from untitledui.com, which the CSP refuses.
- `is-react-component.ts` carries a `biome-ignore-all` for `noExplicitAny`,
  `checkbox.tsx` two `biome-ignore` lines on the hint span, each with the reason.

---

## Icons

`src/icons.tsx` is the only file in the repository allowed to import
`@hugeicons/react` or `@hugeicons/core-free-icons`. Everything else imports
named icons from `@repo/ui/icons`.

Each export wraps one glyph in a component with the shape Untitled UI expects,
`FC<{ className?: string }>`, so components take `icon={Eye}` untouched. Stroke
width defaults to 2 to match the Untitled UI set; size comes from a class
(`size-5`), which is what the components already apply.

To add an icon:

1. Find the free-tier glyph: `ls node_modules/@hugeicons/core-free-icons/dist/esm | grep -i <name>`
   (only the Stroke Rounded set is free; `Alert02Icon`, `Mail01Icon` style names).
2. Add one line: `export const Mail = createIcon("Mail", Mail01Icon);`
3. Name it after Untitled UI's icon when one exists (`HelpCircle`, `InfoCircle`,
   `EyeOff`), so a component added with the CLI needs only its import line
   changed.

In a server component, pass an element rather than the component —
`iconLeading={<LogOut data-icon="leading" />}` — because a function cannot
cross into a client component. `data-icon` is what `Button` styles.

---

## Styling

- Tokens, not raw values: `bg-brand-solid`, `text-tertiary`, `ring-error`,
  `text-display-sm`. Every token in `theme.css` has a Figma counterpart; a
  hex value or an arbitrary `text-[15px]` breaks that link silently.
- Merge classes with `cx` from `@repo/ui/utils/cx`, never string concatenation.
- Dark mode is the `.dark-mode` class on `<html>`, not `prefers-color-scheme`.
- `globals.css` declares `@source "../components"` so Tailwind scans this
  package from wherever the stylesheet is imported. A new top-level source
  folder needs its own `@source` line.
- The theme reads `--font-inter`; `apps/web` sets it with `next/font`. Without
  it the system stack is used, nothing breaks.

## Tests

Component tests live next to the composition in `__tests__/*.test.tsx` and run
under jsdom with `@testing-library/react` and `user-event`. Test behaviour
through roles and the keyboard — `getByRole("columnheader")`, `user.tab()`,
`user.keyboard("{Enter}")` — not through class names. `pnpm test` here runs
them; `pnpm check` at the root includes them.

## Forms

Untitled UI fields are React Aria fields. In a form that a Server Action
validates, render `<Form validationBehavior="aria">` and drive `isInvalid` and
`hint` from the action state. The default `"native"` lets the browser block the
submit with its own untranslated messages before the server sees anything.
