import { requireSession } from "@repo/auth";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getOrderStatus } from "../queries";
import { orderIdSchema } from "../schema";

/**
 * The entire success page, behind its own Suspense boundary (see
 * `app/[locale]/(app)/checkout/success/page.tsx`).
 *
 * Shows whatever status is in the database right now — never "paid" just
 * because the provider's hosted checkout redirected here. That redirect
 * fires the instant the customer finishes on the provider's side, which can
 * (and regularly does) outrace the webhook that is the only thing allowed to
 * mark the order paid. A `pending` order here a moment later than usual is
 * the correct state to show, not a bug to work around.
 */
export async function OrderStatus({ orderId }: { orderId: string | undefined }) {
  const session = await requireSession();
  const t = await getTranslations("checkout.success");

  const id = orderIdSchema.safeParse({ orderId });
  const order = id.success ? await getOrderStatus(session.user.id, id.data.orderId) : null;

  if (!order) notFound();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-display-xs font-semibold text-primary">{t("title")}</h1>
      <p className="text-md text-tertiary">{t(`status.${order.status}`)}</p>
    </div>
  );
}
