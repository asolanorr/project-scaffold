/**
 * Registered in `auth.ts`'s `user.additionalFields`. `input: false` is the
 * whole security property here: Better Auth returns and types this field on
 * every session, but refuses it from any request body — sign-up, the
 * update-user endpoint, anywhere a client could otherwise set it. The only
 * way to grant or revoke admin is a direct database write from an
 * admin-only action (see apps/web/src/features/admin/actions.ts), never
 * through Better Auth's own API.
 *
 * Deliberately its own file, with no imports. `auth.ts` reads this at
 * module-evaluation time to build the `betterAuth({...})` config object, and
 * it used to live in `admin.ts` alongside `requireAdmin()` — which imports
 * `getSession` from `session.ts`, which imports `auth` from `auth.ts`. That
 * made a real cycle (auth.ts → admin.ts → session.ts → auth.ts): evaluating
 * auth.ts pulled in admin.ts before auth.ts's own `export const auth = ...`
 * line had run, which pulled in session.ts's import of the still-mid-
 * evaluation `auth` binding. Node's module system tolerates that as long as
 * nothing reads the binding before it settles; Next's production bundler did
 * not, and `userRoleField` came back `ReferenceError: Cannot access ... before
 * initialization`. A plain data constant with zero dependencies cannot be
 * part of a cycle, which is the actual fix — not a reordering or a lazy
 * getter around the same cycle.
 */
export const userRoleField = {
  role: {
    type: "string",
    required: true,
    defaultValue: "user",
    input: false,
  },
} as const;
