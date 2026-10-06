import { z } from "zod";

/** The only thing a browser gets to choose: which price. The amount is
 * looked up from it server-side, in `actions.ts` — never read from the form. */
export const createCheckoutSchema = z.object({
  priceId: z.string().min(1),
});

export const orderIdSchema = z.object({
  orderId: z.uuid(),
});

export const PAYMENT_ERROR_KEYS = ["priceNotFound", "notFound"] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_KEYS)[number];
