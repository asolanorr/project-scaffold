import { requireSession } from "@repo/auth";
import { Button } from "@repo/ui/components/base/buttons/button";
import { LogOut } from "@repo/ui/icons";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "../actions";

/**
 * The signed-in half of the dashboard, behind its own Suspense boundary.
 *
 * The middleware already turned away visitors with no session cookie, and that
 * is not why `requireSession()` is here. Middleware is UX; this is the
 * authorization boundary, re-checked on every page and every action. See
 * ARCHITECTURE.md §5 on CVE-2025-29927 — the class of bug where a request skips
 * middleware entirely recurs, and a page that trusted it would be wide open.
 */
export async function SessionDetails() {
  const session = await requireSession();
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-md text-tertiary">{t("signedInAs", { email: session.user.email })}</p>
      <form action={signOutAction}>
        {/* An element, not the component: a server component cannot hand a
            function to a client one. `data-icon` is what Button styles. */}
        <Button type="submit" color="secondary" iconLeading={<LogOut data-icon="leading" />}>
          {tCommon("signOut")}
        </Button>
      </form>
    </div>
  );
}
