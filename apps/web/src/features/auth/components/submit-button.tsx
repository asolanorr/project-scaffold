"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

export type SubmitButtonProps = {
  label: string;
};

export function SubmitButton({ label }: SubmitButtonProps) {
  const t = useTranslations("common");
  // useFormStatus reads the pending state of the enclosing form, which is why
  // this is its own component — the hook only sees a form it is rendered
  // inside. There is no manual loading state to keep in sync.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" isLoading={pending} showTextWhileLoading>
      {pending ? t("submitting") : label}
    </Button>
  );
}
