"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { Form } from "@repo/ui/components/base/form/form";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/routes";
import { resetPasswordAction } from "../actions";
import { type AuthErrorCode, MIN_PASSWORD_LENGTH, toFormErrorKey } from "../constants";
import { FormField } from "./form-field";
import { StatusMessage } from "./status-message";
import { SubmitButton } from "./submit-button";

type State = ActionState<undefined, AuthErrorCode>;

/** The token travels in a hidden field; the action validates it. */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.resetPassword");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const [state, formAction] = useActionState<State, FormData>(resetPasswordAction, { ok: false });

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-4">
        <StatusMessage tone="success">{t("done")}</StatusMessage>
        <Button href={SIGN_IN_PATH}>{tCommon("signIn")}</Button>
      </div>
    );
  }

  return (
    <Form action={formAction} validationBehavior="aria" className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {state.code ? (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-error-primary">
            {tErrors(toFormErrorKey(state.code), { min: MIN_PASSWORD_LENGTH })}
          </p>
          {state.code === "invalidToken" ? (
            <Button color="link-color" size="sm" href={FORGOT_PASSWORD_PATH}>
              {t("requestNew")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <FormField
        name="password"
        type="password"
        label={t("newPassword")}
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        errors={state.errors?.password}
      />
      <SubmitButton label={t("submit")} />
    </Form>
  );
}
