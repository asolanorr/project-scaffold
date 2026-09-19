import { BadgeWithDot } from "@repo/ui/components/base/badges/badges";
import { useTranslations } from "next-intl";
import type { ProjectStatus } from "../schema";

// The status is stored as a code and translated here, at render (i18n rule).
const colors = {
  draft: "gray",
  active: "success",
  archived: "warning",
} as const;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations("projects.status");

  return (
    <BadgeWithDot color={colors[status]} size="sm" type="pill-color">
      {t(status)}
    </BadgeWithDot>
  );
}
