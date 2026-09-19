"use client";

import { Input } from "@repo/ui/components/base/input/input";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { MIN_PASSWORD_LENGTH, toFieldErrorKey } from "../constants";

export type FormFieldProps = {
  name: string;
  type: string;
  label: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  /** Message keys from the action, not sentences. */
  errors: string[] | undefined;
};

/**
 * One field of an auth form: label, input and the first error the action
 * reported for it.
 *
 * Validation is the server's job, so the field never validates on its own —
 * `isInvalid` and the hint come straight from the action state. React Aria
 * wires the label and the error message to the input (`aria-describedby`,
 * `aria-invalid`), which is what a screen reader needs to announce the failure
 * next to the field rather than somewhere above the form.
 */
export function FormField({
  name,
  type,
  label,
  autoComplete,
  required,
  minLength,
  defaultValue,
  errors,
}: FormFieldProps) {
  const t = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const { pending } = useFormStatus();

  return (
    <Input
      name={name}
      type={type}
      label={label}
      autoComplete={autoComplete}
      minLength={minLength}
      defaultValue={defaultValue}
      isRequired={required}
      // Every auth field is required, so the asterisk would say nothing.
      hideRequiredIndicator
      isDisabled={pending}
      isInvalid={errors !== undefined}
      hint={errors ? t(toFieldErrorKey(errors[0]), { min: MIN_PASSWORD_LENGTH }) : undefined}
      passwordToggleLabel={type === "password" ? tCommon("togglePassword") : undefined}
    />
  );
}
