"use server";

import { requireSession } from "@repo/auth";
import { db, orders, prices } from "@repo/db";
import { env } from "@repo/env";
import { payments } from "@repo/payments";
import { and, eq } from "drizzle-orm";
import type { Route } from "next";
// arch-allow(web-localized-navigation): redirects to Stripe's hosted page, an external URL that next-intl's redirect would prefix with a locale
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { localizedPath } from "@/i18n/routing";
import type { ActionState } from "@/lib/action-state";
import { parseFormData } from "@/lib/form";
import { CHECKOUT_CANCEL_PATH, CHECKOUT_SUCCESS_PATH } from "@/lib/routes";
import { messageKeys } from "@/lib/validation";
import { createCheckoutSchema, type PaymentErrorCode } from "./schema";

export type CheckoutActionState = ActionState<never, PaymentErrorCode>;

//#region createCheckout
export async function createCheckoutOrder(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  // 1. authenticate
  const session = await requireSession();

  // 2. validate — the browser chooses which price, nothing about its amount.
  const parsed = createCheckoutSchema.safeParse(parseFormData(formData), { error: messageKeys });
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };

  // 3. authorize — any signed-in user may buy; the price itself gates what
  //    is for sale (`active`).
  // 4. execute — the price is read from the database here. Nothing in this
  //    function ever reads an amount or currency off the request: not the
  //    form, not a hidden field, not a query string.
  const [price] = await db
    .select({
      id: prices.id,
      name: prices.name,
      amountMinor: prices.amountMinor,
      currency: prices.currency,
    })
    .from(prices)
    .where(and(eq(prices.id, parsed.data.priceId), eq(prices.active, true)))
    .limit(1);
  if (!price) return { ok: false, code: "priceNotFound" };

  const [order] = await db
    .insert(orders)
    .values({
      buyerId: session.user.id,
      priceId: price.id,
      amountMinor: price.amountMinor,
      currency: price.currency,
    })
    .returning({ id: orders.id, amountMinor: orders.amountMinor, currency: orders.currency });
  if (!order) throw new Error("insert returned no row");

  const locale = await getLocale();
  const origin = env.BETTER_AUTH_URL;
  const checkout = await payments().createCheckout({
    orderId: order.id,
    amountMinor: order.amountMinor,
    currency: order.currency,
    productName: price.name,
    customerEmail: session.user.email,
    successUrl: `${origin}${localizedPath(locale, CHECKOUT_SUCCESS_PATH)}?orderId=${order.id}`,
    cancelUrl: `${origin}${localizedPath(locale, CHECKOUT_CANCEL_PATH)}`,
  });

  await db
    .update(orders)
    .set({ providerReference: checkout.providerReference })
    .where(eq(orders.id, order.id));

  // 5. invalidate — nothing to invalidate yet: the success page's cache tag
  //    is only ever set by the webhook, which is the sole writer of status.
  // 6. respond — by leaving: Stripe's hosted page is where this ends. The
  //    cast, not a literal: this is Stripe's own URL, not one of this app's
  //    routes, so it can never be checked against the generated route types.
  redirect(checkout.url as Route);
}
//#endregion
