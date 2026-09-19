import { routing } from "@/i18n/routing";

/**
 * The 404 every unmatched path currently reaches, in English.
 *
 * It renders its own document because there is no root layout — every route
 * lives under `[locale]`, whose layout supplies `<html>` for matched routes.
 * That layout is also where the stylesheet is imported, so nothing from
 * @repo/ui reaches this page; the styling is inline for that reason.
 *
 * Untranslated, and for now that is a real gap rather than a considered
 * exception: `[locale]/not-found.tsx` is where a Spanish visitor should land.
 * See the note there for why it cannot be wired up yet.
 */
export default function NotFound() {
  return (
    <html lang={routing.defaultLocale}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
          <h1>404</h1>
          <p>This page could not be found.</p>
        </main>
      </body>
    </html>
  );
}
