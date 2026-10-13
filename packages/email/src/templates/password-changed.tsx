import { Text } from "@react-email/components";
// See layout.tsx for why this explicit import is necessary.
// biome-ignore lint/correctness/noUnusedImports: used by the classic JSX transform's React.createElement calls, invisible to static analysis
import React from "react";
import { type EmailLocale, messages } from "../messages";
import { Layout, textStyle } from "./layout";

export type PasswordChangedProps = {
  name: string;
  /** When it happened. Formatted here, in the recipient's locale. */
  changedAt: Date;
  /** Where to go if it was not them: the forgot-password page. */
  resetUrl: string;
};

export function PasswordChanged({
  locale,
  name,
  changedAt,
  resetUrl,
}: PasswordChangedProps & { locale: EmailLocale }) {
  const t = messages[locale];
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(changedAt);
  return (
    <Layout
      locale={locale}
      common={t.common}
      preview={t.passwordChanged.preview}
      name={name}
      action={{ label: t.passwordChanged.button, url: resetUrl }}
      showIgnore={false}
    >
      <Text style={textStyle}>{t.passwordChanged.body(`${when} UTC`)}</Text>
      <Text style={textStyle}>{t.passwordChanged.action}</Text>
    </Layout>
  );
}

export const passwordChangedSubject = (locale: EmailLocale) =>
  messages[locale].passwordChanged.subject;
