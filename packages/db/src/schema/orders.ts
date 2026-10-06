import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { users } from "./auth";
import { prices } from "./prices";

//#region table
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
]);
export type OrderStatus = (typeof orderStatus.enumValues)[number];

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    priceId: text("price_id")
      .notNull()
      .references(() => prices.id),
    // Snapshotted from `prices` at order creation — never re-read live. A
    // price change after the fact must not change what an existing,
    // already-quoted order charges.
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    // The provider's checkout session id. Null until `createCheckout`
    // returns one; a plain (non-partial) unique index still allows that,
    // since Postgres never treats two NULLs as equal.
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("orders_buyer_status_idx").on(t.buyerId, t.status, t.createdAt),
    uniqueIndex("orders_provider_reference_uq").on(t.providerReference),
  ],
);

/**
 * One row per provider webhook event ever acted on, written in the same
 * transaction as the order's state change (see
 * apps/web/src/features/payments/transition.ts). The primary key is the
 * provider's own event id — inserting it a second time is a unique
 * violation, which is the whole idempotency mechanism: a retried webhook
 * fails this insert, the transaction rolls back, and the order is untouched.
 */
export const processedEvents = pgTable(
  "processed_events",
  {
    id: text("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("processed_events_order_idx").on(t.orderId)],
);
//#endregion

//#region transitions
/**
 * Every legal move. `pending` is the only non-terminal start; `failed`,
 * `expired` and `refunded` are terminal. `paid` moves only to `refunded` —
 * notably not back to `failed` or `expired`, so a stale or out-of-order
 * webhook can never undo a completed payment.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "failed", "expired"],
  paid: ["refunded"],
  failed: [],
  expired: [],
  refunded: [],
};

export class IllegalOrderTransition extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Illegal order transition: ${from} -> ${to}`);
  }
}

/**
 * The one gate every order status change passes through. Throws rather than
 * clamping or ignoring, so a caller cannot accidentally apply an illegal move
 * by forgetting to check the return value first.
 */
export function nextOrderStatus(current: OrderStatus, target: OrderStatus): OrderStatus {
  if (!(ORDER_TRANSITIONS[current] as OrderStatus[]).includes(target)) {
    throw new IllegalOrderTransition(current, target);
  }
  return target;
}
//#endregion

export const selectOrderSchema = createSelectSchema(orders);

export const orderColumns = {
  id: orders.id,
  priceId: orders.priceId,
  amountMinor: orders.amountMinor,
  currency: orders.currency,
  status: orders.status,
  createdAt: orders.createdAt,
} as const;

export type Order = z.infer<typeof selectOrderSchema>;
export type OrderView = Pick<Order, keyof typeof orderColumns>;
