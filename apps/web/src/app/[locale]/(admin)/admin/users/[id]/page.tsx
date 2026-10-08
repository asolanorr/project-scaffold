import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { UserEdit } from "@/features/admin/components/user-edit";
import { resolveLocale } from "@/lib/locale";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const { id } = await params;
  const t = await getTranslations("common");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <Suspense fallback={<p className="text-md text-tertiary">{t("loading")}</p>}>
        <UserEdit id={id} />
      </Suspense>
    </main>
  );
}
