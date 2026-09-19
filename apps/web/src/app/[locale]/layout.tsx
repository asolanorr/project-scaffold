import { inter } from "@repo/ui/fonts";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { routing } from "@/i18n/routing";
import { resolveLocale } from "@/lib/locale";
import { Providers } from "./providers";
import "@/styles/globals.css";

// Every locale is a known value, so the shells can be prerendered rather than
// built per request.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
  const locale = await resolveLocale(props.params);
  const t = await getTranslations({ locale, namespace: "marketing" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);

  // Tells next-intl which locale this render is for without reading request
  // state, which is what keeps the page statically renderable.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={inter.variable}>
      <body className="bg-primary text-primary antialiased">
        {/* No `messages` prop: the provider picks them up from the request
            config, and passing them explicitly ships every namespace to the
            browser whether a client component needs it or not. */}
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <Suspense fallback={null}>
          <RequestBoundary />
        </Suspense>
      </body>
    </html>
  );
}

/**
 * Renders nothing; exists to make every route partially prerendered.
 *
 * `connection()` is a request-time read, so this boundary cannot be resolved
 * at build. Next then prerenders the static shell and streams the rest per
 * request — and "the rest" includes the page's flight data, which is what
 * gets the CSP nonce stamped on it. Without this, a fully static page inlines
 * its flight data into the shell with no nonce, the browser refuses it, and
 * the page never hydrates. See buildContentSecurityPolicy in
 * lib/security-headers.ts.
 */
async function RequestBoundary() {
  await connection();
  return null;
}
