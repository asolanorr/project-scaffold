import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { adminUserPath } from "@/lib/routes";
import { listUsersForAdmin } from "../queries";

export async function UsersList() {
  const rows = await listUsersForAdmin();
  const t = await getTranslations("admin.users");
  const tRole = await getTranslations("admin.user.role");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-tertiary">
              <th className="py-2 pr-4 font-medium">{t("columns.name")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.email")}</th>
              <th className="py-2 pr-4 font-medium">{t("columns.role")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id} className="border-t border-secondary">
                <td className="py-2 pr-4">
                  <Link
                    href={adminUserPath(user.id)}
                    className="font-medium text-brand-secondary hover:text-brand-secondary_hover hover:underline"
                  >
                    {user.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-tertiary">{user.email}</td>
                <td className="py-2 pr-4 text-tertiary">{tRole(user.role)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
