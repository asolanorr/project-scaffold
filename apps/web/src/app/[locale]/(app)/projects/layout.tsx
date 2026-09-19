import type { ReactNode } from "react";
import { ProjectMutationsProvider } from "@/features/projects/components/project-mutations";

/**
 * Shared by every projects route. Exists so that delete-with-undo is callable
 * from all of them — see ProjectMutationsProvider for why that has to be a
 * layout and not the button.
 */
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectMutationsProvider>{children}</ProjectMutationsProvider>;
}
