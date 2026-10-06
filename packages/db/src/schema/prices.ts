import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

/**
 * The only authoritative source for what something costs. The checkout
 * action reads a row from here by `id` and ignores any amount the request
 * claims — a price is looked up, never trusted in from the client.
 */
//#region table
export const prices = pgTable("prices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Integer minor units (cents), never a float — the same representation
  // `orders.amountMinor` snapshots at order time.
  amountMinor: integer("amount_minor").notNull(),
  // ISO 4217, lowercase (e.g. "usd") — Stripe's own convention.
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true),
});
//#endregion

export const selectPriceSchema = createSelectSchema(prices);

export const priceColumns = {
  id: prices.id,
  name: prices.name,
  amountMinor: prices.amountMinor,
  currency: prices.currency,
} as const;

export type Price = z.infer<typeof selectPriceSchema>;
export type PriceView = Pick<Price, keyof typeof priceColumns>;
