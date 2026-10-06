import { db, orders, prices } from "@repo/db";
import { OWNER } from "../../projects/__tests__/fixtures";

export async function seedPrice(overrides: Partial<typeof prices.$inferInsert> = {}) {
  const [price] = await db
    .insert(prices)
    .values({
      id: "pro_monthly",
      name: "Pro plan",
      amountMinor: 1999,
      currency: "usd",
      ...overrides,
    })
    .returning();
  if (!price) throw new Error("fixture insert returned no row");
  return price;
}

export async function insertOrder(overrides: Partial<typeof orders.$inferInsert> = {}) {
  const [order] = await db
    .insert(orders)
    .values({
      buyerId: OWNER.id,
      priceId: "pro_monthly",
      amountMinor: 1999,
      currency: "usd",
      status: "pending",
      ...overrides,
    })
    .returning();
  if (!order) throw new Error("fixture insert returned no row");
  return order;
}
