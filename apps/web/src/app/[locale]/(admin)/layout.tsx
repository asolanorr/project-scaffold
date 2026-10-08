import { requireAdmin } from "@repo/auth";
import type { ReactNode } from "react";
import { Suspense } from "react";

/**
 * The authorization boundary for the whole admin section, not per-page: a
 * route added later under `(admin)` without its own `requireAdmin()` call is
 * still gated here. Every admin Server Action calls `requireAdmin()` again
 * on its own — a layout guards rendering, not the action functions a
 * crafted request could call directly — but there is exactly one place a
 * page can forget the check, and this is it.
 *
 * `requireAdmin()` reads the session, which `cacheComponents` requires to sit
 * behind a `<Suspense>` boundary — otherwise every admin route blocks on it
 * at build time. The fallback renders nothing: this check is normally
 * instant, and there is no translated string worth showing for a boundary
 * whose entire job is to disappear before anyone sees it render.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
