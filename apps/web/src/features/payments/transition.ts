import "server-only";

import {
  db,
  IllegalOrderTransition,
  nextOrderStatus,
  type OrderStatus,
  type OrderView,
  orderColumns,
  orders,
  processedEvents,
} from "@repo/db";
import { eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db-errors";

export class OrderNotFound extends Error {
  constructor(readonly orderId: string) {
    super(`Order not found: ${orderId}`);
  }
}

export type TransitionOutcome =
  /** The status changed. */
  | { status: "applied"; order: OrderView }
  /** This exact provider event id was already processed — the whole point
   * of `processed_events`. Not an error: webhooks are delivered at least
   * once, and a retry must be a no-op, not a second fulfillment. */
  | { status: "duplicate" }
  /** A new event, but one that does not belong in this order's current
   * state (e.g. an `expired` arriving after `paid` already landed, out of
   * delivery order). The event is still recorded, so retries of it also
   * land here rather than ever re-attempting the transition. */
  | { status: "ignored"; order: OrderView }
  | { status: "orderNotFound" };

/**
 * The one function that changes an order's status. The event row and the
 * status change are written in the same transaction, in that order: the
 * event insert is what makes a retried webhook a no-op (its unique
 * violation rolls back before the order is ever read), and an illegal
 * transition is caught and turned into "ignored" rather than left to
 * `nextOrderStatus`'s throw, which would otherwise look like a real failure
 * to the caller instead of the normal, expected outcome it is here.
 */
export async function transitionOrder(params: {
  eventId: string;
  eventType: string;
  orderId: string;
  targetStatus: OrderStatus;
  providerReference: string;
}): Promise<TransitionOutcome> {
  try {
    return await db.transaction(async (tx) => {
      // Looked up before the event is recorded: `processed_events.order_id`
      // has a foreign key to `orders`, so an order that does not exist must
      // be ruled out first, or the insert below fails on that constraint
      // instead of reporting the order as missing.
      const [current] = await tx
        .select(orderColumns)
        .from(orders)
        .where(eq(orders.id, params.orderId))
        .limit(1);
      if (!current) throw new OrderNotFound(params.orderId);

      await tx.insert(processedEvents).values({
        id: params.eventId,
        orderId: params.orderId,
        type: params.eventType,
      });

      let target: OrderStatus;
      try {
        target = nextOrderStatus(current.status, params.targetStatus);
      } catch (error) {
        if (error instanceof IllegalOrderTransition) {
          return { status: "ignored", order: current } as const;
        }
        throw error;
      }

      const [updated] = await tx
        .update(orders)
        .set({ status: target, providerReference: params.providerReference })
        .where(eq(orders.id, params.orderId))
        .returning(orderColumns);
      if (!updated) throw new Error("update returned no row");

      return { status: "applied", order: updated } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "duplicate" };
    if (error instanceof OrderNotFound) return { status: "orderNotFound" };
    throw error;
  }
}
