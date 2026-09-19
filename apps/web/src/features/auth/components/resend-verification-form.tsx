"use client";

import { useTranslations } from "next-intl";
import { resendVerificationAction } from "../actions";
import { EmailForm } from "./email-form";
import { StatusMessage } from "./status-message";

/** The resend form on the check-email page; the endpoint has its own rate limit. */
export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const t = useTranslations("auth.checkEmail");
  return (
    <EmailForm
      action={resendVerificationAction}
      submitLabel={t("resend")}
      defaultEmail={defaultEmail}
      onSuccess={() => <StatusMessage tone="success">{t("resent")}</StatusMessage>}
    />
  );
}
