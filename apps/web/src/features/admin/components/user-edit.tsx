import { Button } from "@repo/ui/components/base/buttons/button";
import { ArrowLeft } from "@repo/ui/icons";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ADMIN_USERS_PATH } from "@/lib/routes";
import { getUserForAdmin } from "../queries";
import { userIdSchema } from "../schema";
import { UserEditForm } from "./user-edit-form";

export async function UserEdit({ id }: { id: string }) {
  // Not a real id at all: 404 before anything touches the database.
  if (!userIdSchema.safeParse({ id }).success) notFound();

  const user = await getUserForAdmin(id);
  // Missing and deleted end here, indistinguishably — the same shape as
  // every other not-found in this app, so an admin section leaks no more
  // than any other 404 would.
  if (!user) notFound();

  const t = await getTranslations("admin.user");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          color="link-gray"
          size="md"
          href={ADMIN_USERS_PATH}
          iconLeading={<ArrowLeft data-icon="leading" />}
        >
          {t("backLink")}
        </Button>
      </div>

      <div>
        <h1 className="text-display-xs font-semibold text-primary">{user.name}</h1>
        <p className="text-md text-tertiary">{user.email}</p>
      </div>

      <UserEditForm user={user} />
    </div>
  );
}
