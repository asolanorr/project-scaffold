"use client";

import { RouterProvider } from "@repo/ui/router";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { getPathname, useRouter } from "@/i18n/navigation";

// Lets React Aria type the `routerOptions` argument of `navigate` as what
// next-intl's router accepts: Next's NavigateOptions plus `locale`. The
// augmentation is the only reason react-aria-components is a direct
// dependency here; components still come from @repo/ui.
declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

/**
 * Client-side providers for everything under `[locale]`.
 *
 * `RouterProvider` makes every React Aria link — `Button` with an `href`, for
 * one — navigate through the app router instead of a full page load. Wired to
 * next-intl's wrappers around `next/navigation` rather than to
 * `next/navigation` directly: those add the locale prefix, so a Spanish
 * visitor clicking `href="/sign-up"` lands on `/es/sign-up`, and `useHref`
 * writes the same localized URL into the anchor for hover, right-click and
 * crawlers.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();

  return (
    <RouterProvider
      navigate={(href, options) => router.push(href, options)}
      useHref={(href) => getPathname({ href, locale })}
    >
      {children}
    </RouterProvider>
  );
}
