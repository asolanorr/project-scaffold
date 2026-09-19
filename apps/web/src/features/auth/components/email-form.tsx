"use client";

import { Form } from "@repo/ui/components/base/form/form";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { type AuthErrorCode, MIN_PASSWORD_LENGTH, toFormErrorKey } from "../constants";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";

type EmailFormState = ActionState<undefined, AuthErrorCode> & { email?: string };

export type EmailFormProps = {
  action: (state: EmailFormState, formData: FormData) => Promise<EmailFormState>;
  submitLabel: string;
  /** Pre-filled address, when the previous page knew it. */
  defaultEmail?: string;
  /** Rendered instead of the form once the action has succeeded. */
  onSuccess: (email: string) => ReactNode;
};

/**
 * One email field and a submit: forgot-password and resend-verification. On
 * success the form is replaced by whatever the page wants to say, so a second
 * click needs a reload — which is the point for endpoints that send mail.
 */
export function EmailForm({ action, submitLabel, defaultEmail, onSuccess }: EmailFormProps) {
  const t = useTranslations("common");
  const tErrors = useTranslations("auth.errors");
  const [state, formAction] = useActionState<EmailFormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      // Keep the address the user typed so the success message can repeat it.
      return result.ok ? { ...result, email: String(formData.get("email") ?? "") } : result;
    },
    { ok: false },
  );

  if (state.ok) return <>{onSuccess(state.email ?? defaultEmail ?? "")}</>;

  return (
    <Form action={formAction} validationBehavior="aria" className="flex flex-col gap-5">
      {state.code ? (
        <p className="text-sm text-error-primary" role="alert">
          {tErrors(toFormErrorKey(state.code), { min: MIN_PASSWORD_LENGTH })}
        </p>
      ) : null}
      <FormField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        defaultValue={defaultEmail}
        errors={state.errors?.email}
      />
      <SubmitButton label={submitLabel} />
    </Form>
  );
}
