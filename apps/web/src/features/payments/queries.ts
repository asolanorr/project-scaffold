import "server-only";

import { db, type OrderView, orderColumns, orders } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";

/**
 * The only thing the checkout success page is allowed to show: whatever
 * status is actually stored, scoped to the signed-in buyer. The redirect
 * back from the provider's hosted checkout page carries no payment
 * information this reads — Stripe sends the browser here the instant the
 * customer finishes, which can race the webhook that is the only thing
 * allowed to mark the order paid. A pending order on this page a moment
 * later than usual is the correct and expected state, not a bug.
 */
export async function getOrderStatus(buyerId: string, orderId: string): Promise<OrderView | null> {
  "use cache";
  cacheTag(cacheTags.order(orderId));

  const [order] = await db
    .select(orderColumns)
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)))
    .limit(1);

  return order ?? null;
}
