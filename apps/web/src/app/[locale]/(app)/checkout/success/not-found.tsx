"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { useTranslations } from "next-intl";

/**
 * Reached through `notFound()` from `OrderStatus`: the id is not a uuid, the
 * order is gone, or it belongs to someone else. One page for all three, so
 * nothing about which it was leaks.
 *
 * A client component on purpose: a not-found boundary has no `params`, so a
 * server `getTranslations()` here would resolve the locale from the request
 * and block the route's prerender. The client hook reads it from the
 * provider the layout already rendered.
 */
export default function OrderNotFound() {
  const t = useTranslations("checkout.success");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col items-start gap-3 px-4 py-12 md:px-8">
      <h1 className="text-display-xs font-semibold text-primary">{t("notFoundTitle")}</h1>
      <p className="text-md text-tertiary">{t("notFoundDescription")}</p>
      <Button color="secondary" href="/dashboard">
        {t("backLink")}
      </Button>
    </main>
  );
}
