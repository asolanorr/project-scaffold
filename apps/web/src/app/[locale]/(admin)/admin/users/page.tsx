import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { UsersList } from "@/features/admin/components/users-list";
import { resolveLocale } from "@/lib/locale";

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(await resolveLocale(params));
  const t = await getTranslations("common");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <Suspense fallback={<p className="text-md text-tertiary">{t("loading")}</p>}>
        <UsersList />
      </Suspense>
    </main>
  );
}
