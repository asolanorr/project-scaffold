import { getTranslations } from "next-intl/server";

/**
 * Translated 404 for notFound() raised inside the locale segment.
 *
 * KNOWN ISSUE: currently unreachable, so every 404 is answered by the
 * untranslated root `app/not-found.tsx` — `/es/nope` included. The usual fix,
 * a `[locale]/[...rest]` catch-all that calls notFound(), does not work under
 * cacheComponents: rendering this boundary re-renders `[locale]/layout.tsx`,
 * whose `await params` is runtime data on a route that matched nothing, so the
 * layout fails to prerender and Next serves an empty error shell instead —
 * which is worse than the English page. See ARCHITECTURE.md §7.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-3 px-4 py-12 md:px-8">
      <h1 className="text-display-xs font-semibold text-primary">{t("notFoundTitle")}</h1>
      <p className="text-md text-tertiary">{t("notFoundDescription")}</p>
    </main>
  );
}
