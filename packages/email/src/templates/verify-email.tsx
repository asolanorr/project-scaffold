import { Text } from "@react-email/components";
// Explicit, not just the automatic-runtime's implicit one: this file is
// rendered outside Next (packages/auth's seed script, and any script run
// with `tsx` from outside this package), where the classic JSX transform
// applies instead and needs `React` in scope. See layout.tsx for the full
// explanation — every template that returns JSX needs this import.
// biome-ignore lint/correctness/noUnusedImports: used by the classic JSX transform's React.createElement calls, invisible to static analysis
import React from "react";
import { type EmailLocale, messages } from "../messages";
import { Layout, mutedStyle, textStyle } from "./layout";

export type VerifyEmailProps = {
  name: string;
  url: string;
};

export function VerifyEmail({ locale, name, url }: VerifyEmailProps & { locale: EmailLocale }) {
  const t = messages[locale];
  return (
    <Layout
      locale={locale}
      common={t.common}
      preview={t.verifyEmail.preview}
      name={name}
      action={{ label: t.verifyEmail.button, url }}
    >
      <Text style={textStyle}>{t.verifyEmail.body}</Text>
      <Text style={mutedStyle}>{t.verifyEmail.expiry}</Text>
    </Layout>
  );
}

export const verifyEmailSubject = (locale: EmailLocale) => messages[locale].verifyEmail.subject;
