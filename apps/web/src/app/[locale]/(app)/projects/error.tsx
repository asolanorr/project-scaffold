"use client";

import { Button } from "@repo/ui/components/base/buttons/button";
import { useTranslations } from "next-intl";

/**
 * The error state for everything under /projects. A query or an action that
 * throws — a bug, a database outage — lands here; expected failures never
 * do, because actions return them. `reset` re-renders the segment.
 */
export default function ProjectsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("projects.errors");
  const tCommon = useTranslations("common");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col items-start gap-3 px-4 py-12 md:px-8">
      <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>
      <p className="max-w-prose text-md text-tertiary">{t("description")}</p>
      <Button color="secondary" onPress={reset}>
        {tCommon("retry")}
      </Button>
    </main>
  );
}
