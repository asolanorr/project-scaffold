import { Text } from "@react-email/components";
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
