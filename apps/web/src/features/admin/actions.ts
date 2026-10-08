"use server";

import { getRequestInfo, requireAdmin } from "@repo/auth";
import {
  type AdminUserView,
  adminUserColumns,
  appendAuditLog,
  db,
  diffFields,
  users,
} from "@repo/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { parseFormData } from "@/lib/form";
import { messageKeys } from "@/lib/validation";
import { type AdminErrorCode, updateUserFormSchema, userIdSchema } from "./schema";

export type UpdateUserState = ActionState<AdminUserView, AdminErrorCode>;

//#region updateUserAsAdmin
export async function updateUserAsAdmin(
  _prev: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  // 1. authenticate + the role check that gates the whole admin section
  const session = await requireAdmin();

  // 2. validate
  const input = parseFormData(formData);
  const id = userIdSchema.safeParse(input, { error: messageKeys });
  if (!id.success) return { ok: false, code: "notFound" };
  const parsed = updateUserFormSchema.safeParse(input, { error: messageKeys });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  const { id: _ignored, ...fields } = parsed.data;

  // 3. authorize — `requireAdmin()` above is the authorization. An admin
  //    acts on any user's record; this is the one mutation in the app where
  //    ownership scoping is deliberately not the gate.
  // 4. execute — the row, its diff, and the audit entry in one transaction,
  //    so a crash between the update and the audit write cannot leave one
  //    without the other.
  const updated = await db.transaction(async (tx) => {
    const [before] = await tx
      .select(adminUserColumns)
      .from(users)
      .where(eq(users.id, id.data.id))
      .limit(1);
    if (!before) return null;

    const [after] = await tx
      .update(users)
      .set(fields)
      .where(eq(users.id, id.data.id))
      .returning(adminUserColumns);
    if (!after) throw new Error("update returned no row");

    const diff = diffFields(before, fields);
    const { ipAddress, userAgent } = await getRequestInfo();
    await appendAuditLog(
      {
        actorId: session.user.id,
        action: "admin.user.updated",
        entityType: "user",
        entityId: after.id,
        diff: Object.keys(diff).length > 0 ? diff : null,
        ipAddress,
        userAgent,
      },
      tx,
    );

    return after;
  });

  if (!updated) return { ok: false, code: "notFound" };

  // 5. invalidate — nothing to invalidate. Admin reads are deliberately
  //    uncached (see features/admin/queries.ts), so there is no tag.
  // 6. respond
  return { ok: true, data: updated };
}
//#endregion
