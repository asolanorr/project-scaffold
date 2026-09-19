import { Text } from "@react-email/components";
import { type EmailLocale, messages } from "../messages";
import { Layout, mutedStyle, textStyle } from "./layout";

export type PasswordResetProps = {
  name: string;
  url: string;
};

export function PasswordReset({ locale, name, url }: PasswordResetProps & { locale: EmailLocale }) {
  const t = messages[locale];
  return (
    <Layout
      locale={locale}
      common={t.common}
      preview={t.passwordReset.preview}
      name={name}
      action={{ label: t.passwordReset.button, url }}
    >
      <Text style={textStyle}>{t.passwordReset.body}</Text>
      <Text style={mutedStyle}>{t.passwordReset.expiry}</Text>
    </Layout>
  );
}

export const passwordResetSubject = (locale: EmailLocale) => messages[locale].passwordReset.subject;
