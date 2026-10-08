"use client";

import { Toaster } from "@repo/ui/composed/toaster";
import { RouterProvider } from "@repo/ui/router";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { getPathname } from "@/i18n/navigation";

// Lets React Aria type the `routerOptions` argument of `navigate` as Next's
// NavigateOptions. The augmentation is the only reason react-aria-components
// is a direct dependency here; components still come from @repo/ui.
declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

/**
 * Client-side providers for everything under `[locale]`.
 *
 * `RouterProvider` makes every React Aria link — `Button` with an `href`, for
 * one — navigate through the app router instead of a full page load. The
 * locale prefix is added by `getPathname` from next-intl, a pure function of
 * the locale from context, for both the anchor's `href` and the navigation.
 *
 * `useRouter` comes from `next/navigation`, not next-intl's wrapper: the
 * wrapper reads `usePathname()`, which on a route with an unknown segment
 * (`/projects/[id]`) is request data, and reading it here — above every
 * Suspense boundary — would stop such routes from prerendering at all.
 *
 * `Toaster` mounts the one toast region.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("common");
  const localize = (href: string) => getPathname({ href, locale });

  return (
    <RouterProvider
      // The cast, not a literal: `href` here is whatever a Button/Link was
      // given at its own call site, already checked once there against
      // lib/routes.ts — this is generic plumbing that every navigation
      // passes through, and it cannot re-prove a runtime string is a
      // literal route any more than next-intl's own `Link` can.
      navigate={(href, options) => router.push(localize(href) as Route, options)}
      useHref={localize}
    >
      {children}
      <Toaster labels={{ region: t("notifications"), close: t("close") }} />
    </RouterProvider>
  );
}
