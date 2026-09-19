"use client";

import { Form } from "@repo/ui/components/base/form/form";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { type AuthErrorCode, MIN_PASSWORD_LENGTH, toFormErrorKey } from "../constants";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";

type AuthFormState = ActionState<undefined, AuthErrorCode>;

export type AuthFormProps = {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  /** Rendered as a hidden input so the action can send the user onward. */
  returnTo?: string;
  returnToName?: string;
  withName?: boolean;
};

export function AuthForm({
  action,
  submitLabel,
  returnTo,
  returnToName,
  withName = false,
}: AuthFormProps) {
  const t = useTranslations("common");
  const tErrors = useTranslations("auth.errors");
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, { ok: false });

  const fieldErrors = state.ok ? undefined : state.errors;
  const formError = state.ok ? undefined : state.code;

  return (
    // "aria" rather than the default "native": the browser must not block the
    // submit on a missing value, because the server validates and returns
    // message keys the fields render. Native validation would show its own
    // untranslated bubbles first.
    <Form action={formAction} validationBehavior="aria" className="flex flex-col gap-5">
      {returnTo && returnToName ? (
        <input type="hidden" name={returnToName} value={returnTo} />
      ) : null}

      {formError ? (
        // role="alert" so the failure is announced rather than silently
        // appearing above a form the user is still looking at.
        <p className="text-sm text-error-primary" role="alert">
          {tErrors(toFormErrorKey(formError), { min: MIN_PASSWORD_LENGTH })}
        </p>
      ) : null}

      {withName ? (
        <FormField
          name="name"
          type="text"
          label={t("name")}
          autoComplete="name"
          required
          errors={fieldErrors?.name}
        />
      ) : null}

      <FormField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        errors={fieldErrors?.email}
      />

      <FormField
        name="password"
        type="password"
        label={t("password")}
        // "current-password" on sign-in, "new-password" on sign-up: the wrong
        // one makes a password manager offer to overwrite a saved credential.
        autoComplete={withName ? "new-password" : "current-password"}
        required
        minLength={withName ? MIN_PASSWORD_LENGTH : undefined}
        errors={fieldErrors?.password}
      />

      <SubmitButton label={submitLabel} />
    </Form>
  );
}
