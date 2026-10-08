"use client";

import { Dialog, Modal, ModalOverlay } from "@repo/ui/components/application/modals/modal";
import { Button } from "@repo/ui/components/base/buttons/button";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Heading } from "react-aria-components";
import { useRouter } from "@/i18n/navigation";
import { PROJECTS_PATH } from "@/lib/routes";
import { useProjectMutations } from "./project-mutations";

/**
 * Delete behind a confirmation. The deletion itself, and the undo toast that
 * follows it, live in `ProjectMutationsProvider`; this is only the dialog.
 */
export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("projects.delete");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { remove } = useProjectMutations();
  const [isOpen, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const deleted = await remove({ id, name });
      setOpen(false);
      if (deleted) router.push(PROJECTS_PATH);
    });

  return (
    <>
      <Button color="secondary-destructive" onPress={() => setOpen(true)}>
        {tCommon("delete")}
      </Button>

      <ModalOverlay isOpen={isOpen} onOpenChange={setOpen} isDismissable={!isPending}>
        <Modal className="w-full max-w-md">
          <Dialog role="alertdialog" className="flex flex-col gap-4 p-6">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              {t("title")}
            </Heading>
            <p className="text-sm text-tertiary">{t("description", { name })}</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button color="secondary" isDisabled={isPending} onPress={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                color="primary-destructive"
                isLoading={isPending}
                showTextWhileLoading
                onPress={confirm}
              >
                {t("confirm")}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
