"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { AdminUserView } from "@repo/db/schema";
import { Button } from "@repo/ui/components/base/buttons/button";
import { Form } from "@repo/ui/components/base/form/form";
import { Input } from "@repo/ui/components/base/input/input";
import { Select } from "@repo/ui/components/base/select/select";
import { toast } from "@repo/ui/composed/toaster";
import { useTranslations } from "next-intl";
import { startTransition, useActionState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { messageKeys, toValidationKey } from "@/lib/validation";
import { type UpdateUserState, updateUserAsAdmin } from "../actions";
import { updateUserFormSchema } from "../schema";

type FormValues = z.input<typeof updateUserFormSchema>;

const resolver = zodResolver(updateUserFormSchema, { error: messageKeys });

export function UserEditForm({ user }: { user: AdminUserView }) {
  const t = useTranslations("admin.user");
  const tErrors = useTranslations("admin.errors");
  const tValidation = useTranslations("validation");
  const tCommon = useTranslations("common");

  const [state, formAction, isPending] = useActionState(
    async (prev: UpdateUserState, formData: FormData) => {
      const result = await updateUserAsAdmin(prev, formData);
      if (result.ok) toast({ title: t("saved") });
      return result;
    },
    { ok: false },
  );

  const form = useForm<FormValues>({
    resolver,
    mode: "onTouched",
    defaultValues: { id: user.id, name: user.name, role: user.role },
  });

  const onSubmit = form.handleSubmit((_values, event) => {
    const element = event?.target;
    if (!(element instanceof HTMLFormElement)) return;
    const formData = new FormData(element);
    startTransition(() => formAction(formData));
  });

  const formError = state.ok ? undefined : state.code;
  const message = (key: string | undefined) =>
    key ? tValidation(toValidationKey(key)) : undefined;

  const roleItems = [
    { id: "user", label: t("role.user") },
    { id: "admin", label: t("role.admin") },
  ];

  return (
    <Form onSubmit={onSubmit} validationBehavior="aria" className="flex max-w-md flex-col gap-5">
      <input type="hidden" {...form.register("id")} />

      {formError ? (
        <p className="text-sm text-error-primary" role="alert">
          {tErrors(formError)}
        </p>
      ) : null}

      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Input
            name={field.name}
            label={tCommon("name")}
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            isDisabled={isPending}
            isInvalid={fieldState.invalid}
            hint={message(fieldState.error?.message)}
          />
        )}
      />

      <Controller
        control={form.control}
        name="role"
        render={({ field, fieldState }) => (
          <Select
            name={field.name}
            label={t("roleLabel")}
            items={roleItems}
            selectedKey={field.value}
            onSelectionChange={(key) => field.onChange(key)}
            onBlur={field.onBlur}
            isDisabled={isPending}
            isInvalid={fieldState.invalid}
            hint={message(fieldState.error?.message)}
          >
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
          </Select>
        )}
      />

      <div className="flex justify-end gap-3">
        <Button type="submit" isLoading={isPending} showTextWhileLoading>
          {isPending ? tCommon("submitting") : tCommon("save")}
        </Button>
      </div>
    </Form>
  );
}
