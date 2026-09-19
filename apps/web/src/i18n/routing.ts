import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // as-needed: the default locale serves clean URLs (/sign-in) and every other
  // locale is prefixed (/es/sign-in). Both are crawlable and next-intl emits
  // the hreflang alternates. Adding a language is one entry here plus a
  // messages file — there are no per-locale routes or components anywhere.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export function isLocale(value: string | undefined): value is Locale {
  return routing.locales.includes(value as Locale);
}

/**
 * Split a request pathname into its locale and the rest of the path.
 *
 * The middleware needs this before next-intl has resolved anything, to decide
 * whether a path is protected and to build a sign-in URL in the right language.
 */
export function splitLocale(pathname: string): { locale: Locale; pathname: string } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if (isLocale(maybeLocale)) {
    return { locale: maybeLocale, pathname: `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, pathname };
}

/**
 * Build a pathname for a locale. Tied to `localePrefix: "as-needed"` — the
 * default locale carries no prefix.
 */
export function localizedPath(locale: Locale, pathname: string): string {
  return locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
}
