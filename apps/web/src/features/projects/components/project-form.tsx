"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type ProjectView } from "@repo/db/schema";
import { Button } from "@repo/ui/components/base/buttons/button";
import { Form } from "@repo/ui/components/base/form/form";
import { Input } from "@repo/ui/components/base/input/input";
import { Select } from "@repo/ui/components/base/select/select";
import { TextArea } from "@repo/ui/components/base/textarea/textarea";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { PROJECTS_PATH, projectPath } from "@/lib/routes";
import { messageKeys, toValidationKey } from "@/lib/validation";
import type { ProjectActionState } from "../actions";
import { PROJECT_STATUSES } from "../schema";

/** What the fields hold: the schema's input side, so the resolver's types line up. */
type FormValues = z.input<typeof insertProjectSchema>;

export type ProjectFormProps = {
  mode: "create" | "edit";
  action: (prev: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  /** Only for edit: goes into the hidden `id` field the action validates. */
  projectId?: string;
  defaultValues?: Partial<ProjectView>;
};

// The same allowlist the action validates with, so the browser rejects what
// the server would reject, with the same message keys. Imported from
// `@repo/db/schema`, never `@repo/db`: the barrel carries the Postgres client.
const resolver = zodResolver(insertProjectSchema, { error: messageKeys });

/**
 * Create and edit share one form. React Hook Form owns the client-side
 * validation and field state; `useActionState` owns the submission. On
 * submit, RHF validates first and only then hands the real FormData to the
 * Server Action — so a request never leaves for input the browser already
 * knows is wrong, and the server still validates everything it receives.
 */
export function ProjectForm({ mode, action, projectId, defaultValues }: ProjectFormProps) {
  const t = useTranslations("projects.form");
  const tStatus = useTranslations("projects.status");
  const tErrors = useTranslations("projects.errors");
  const tValidation = useTranslations("validation");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Navigation happens here, as a consequence of this submission's result —
  // not in an effect on `state`. Next keeps left-behind segments mounted but
  // hidden for back/forward, so a form that redirected once would, in an
  // effect, redirect again the moment its page is shown a second time.
  const [state, formAction, isPending] = useActionState(
    async (prev: ProjectActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) router.push(projectPath(result.data.id));
      return result;
    },
    { ok: false },
  );

  const form = useForm<FormValues>({
    resolver,
    mode: "onTouched",
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      status: defaultValues?.status ?? "draft",
    },
  });

  // The action returns field errors as keys; put them where RHF renders them.
  useEffect(() => {
    if (state.ok || !state.errors) return;
    for (const [field, keys] of Object.entries(state.errors)) {
      const key = keys?.[0];
      if (key && (field === "name" || field === "description" || field === "status")) {
        form.setError(field, { type: "server", message: key });
      }
    }
  }, [state, form]);

  const onSubmit = form.handleSubmit((_values, event) => {
    const element = event?.target;
    if (!(element instanceof HTMLFormElement)) return;
    const formData = new FormData(element);
    startTransition(() => formAction(formData));
  });

  const formError = state.ok ? undefined : state.code;
  const message = (key: string | undefined) =>
    key ? tValidation(toValidationKey(key)) : undefined;

  const statusItems = PROJECT_STATUSES.map((status) => ({ id: status, label: tStatus(status) }));

  return (
    <Form onSubmit={onSubmit} validationBehavior="aria" className="flex flex-col gap-5">
      {projectId ? <input type="hidden" name="id" value={projectId} /> : null}

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
            label={t("name")}
            placeholder={t("namePlaceholder")}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            isRequired
            hideRequiredIndicator
            isDisabled={isPending}
            isInvalid={fieldState.invalid}
            hint={message(fieldState.error?.message)}
          />
        )}
      />

      <Controller
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <TextArea
            name={field.name}
            label={t("description")}
            placeholder={t("descriptionPlaceholder")}
            rows={4}
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
        name="status"
        render={({ field, fieldState }) => (
          <Select
            name={field.name}
            label={t("status")}
            items={statusItems}
            selectedKey={field.value ?? "draft"}
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
        <Button color="secondary" href={projectId ? projectPath(projectId) : PROJECTS_PATH}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" isLoading={isPending} showTextWhileLoading>
          {isPending ? t("submitting") : mode === "create" ? t("submitCreate") : t("submitEdit")}
        </Button>
      </div>
    </Form>
  );
}
