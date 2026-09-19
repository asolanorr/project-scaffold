"use client";

import { toast } from "@repo/ui/composed/toaster";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { deleteProject, restoreProject } from "../actions";

const initial = { ok: false } as const;

function idForm(id: string): FormData {
  const data = new FormData();
  data.set("id", id);
  return data;
}

type ProjectMutations = {
  /** Soft-delete, then offer undo in a toast. Resolves true when deleted. */
  remove: (project: { id: string; name: string }) => Promise<boolean>;
};

const ProjectMutationsContext = createContext<ProjectMutations | null>(null);

/**
 * Delete-with-undo, mounted from the projects layout.
 *
 * It lives in the layout, not in the delete button, for a reason that is
 * easy to miss: a Server Action can only be invoked from a route whose
 * module graph references it. The undo runs from a toast after the user has
 * been sent to the list, and the list page on its own never imports
 * `restoreProject` — the call would 404 as an unknown action. The layout
 * belongs to every projects route, so what it references is callable from
 * all of them.
 */
export function ProjectMutationsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("projects.delete");
  const tErrors = useTranslations("projects.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const value = useMemo<ProjectMutations>(
    () => ({
      remove: async ({ id, name }) => {
        const result = await deleteProject(initial, idForm(id));
        if (!result.ok) {
          toast({ title: tErrors(result.code ?? "notFound"), tone: "error" });
          return false;
        }

        const undo = async () => {
          const restored = await restoreProject(initial, idForm(id));
          toast(
            restored.ok
              ? { title: t("restored"), tone: "success" }
              : { title: t("undoFailed"), tone: "error" },
          );
          // The list is cached by tag and the action invalidated it; this
          // re-renders whatever page is showing so the row reappears.
          router.refresh();
        };

        toast({
          title: t("deleted"),
          description: t("deletedDescription", { name }),
          action: {
            label: tCommon("undo"),
            onAction: () => {
              void undo();
            },
          },
        });
        return true;
      },
    }),
    [t, tErrors, tCommon, router],
  );

  return (
    <ProjectMutationsContext.Provider value={value}>{children}</ProjectMutationsContext.Provider>
  );
}

export function useProjectMutations(): ProjectMutations {
  const context = useContext(ProjectMutationsContext);
  if (!context) {
    throw new Error("useProjectMutations() needs ProjectMutationsProvider in the projects layout.");
  }
  return context;
}
