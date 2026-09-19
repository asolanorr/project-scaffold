"use client";

import { useTranslations } from "next-intl";
import { forgotPasswordAction } from "../actions";
import { EmailForm } from "./email-form";
import { StatusMessage } from "./status-message";

/** The same text whether or not the address exists — see forgotPasswordAction. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  return (
    <EmailForm
      action={forgotPasswordAction}
      submitLabel={t("submit")}
      onSuccess={(email) => <StatusMessage>{t("sent", { email })}</StatusMessage>}
    />
  );
}
