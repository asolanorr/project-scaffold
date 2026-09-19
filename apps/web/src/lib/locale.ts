import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { type Locale, routing } from "@/i18n/routing";

/**
 * Validate the `[locale]` segment and narrow it to a known locale.
 *
 * The segment is a wildcard, so `/xx/sign-in` reaches the app with `locale`
 * typed as a bare string. Every layout and page runs its params through this so
 * an unknown value 404s once, here, instead of rendering a page with missing
 * messages.
 *
 * Lives in lib rather than i18n/routing because it imports next/navigation, and
 * routing.ts is pulled into the middleware bundle.
 */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}
