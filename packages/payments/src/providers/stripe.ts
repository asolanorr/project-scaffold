import Stripe from "stripe";
import type { CheckoutParams, CheckoutSession, PaymentEvent, PaymentProvider } from "../provider";

export type StripeProviderOptions = {
  secretKey: string;
  webhookSecret: string;
};

/**
 * Checkout Sessions, not pre-registered Stripe Prices: the price lives in
 * this app's own `prices` table (see packages/db/src/schema/prices.ts), so
 * each session is built from `price_data` at checkout time rather than
 * referencing a Stripe-side catalog that would be a second source of truth.
 *
 * `orderId` is set as metadata on both the Session and the PaymentIntent it
 * creates (`payment_intent_data.metadata`) — the Session alone is not enough,
 * because a refund webhook (`charge.refunded`) carries the Charge, which
 * inherits metadata from the PaymentIntent, not from the Session.
 */
export function createStripeProvider({
  secretKey,
  webhookSecret,
}: StripeProviderOptions): PaymentProvider {
  const stripe = new Stripe(secretKey);

  return {
    name: "stripe",

    async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency,
              unit_amount: params.amountMinor,
              product_data: { name: params.productName },
            },
          },
        ],
        metadata: { orderId: params.orderId },
        payment_intent_data: { metadata: { orderId: params.orderId } },
        customer_email: params.customerEmail,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      });
      if (!session.url) throw new Error("Stripe did not return a Checkout URL");
      return { url: session.url, providerReference: session.id };
    },

    verifyWebhook(rawBody: string, signatureHeader: string): Stripe.Event {
      // Throws Stripe.errors.StripeSignatureVerificationError on a missing or
      // forged signature — the caller never sees a parsed event in that case.
      return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    },

    parseEvent(rawEvent: unknown): PaymentEvent | null {
      const event = rawEvent as Stripe.Event;

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.orderId;
          if (!orderId) return null;
          return {
            id: event.id,
            type: STATUS_FOR_SESSION_EVENT[event.type],
            orderId,
            providerReference: session.id,
          };
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const orderId = charge.metadata?.orderId;
          if (!orderId) return null;
          const paymentIntent = charge.payment_intent;
          return {
            id: event.id,
            type: "payment.refunded",
            orderId,
            providerReference: typeof paymentIntent === "string" ? paymentIntent : charge.id,
          };
        }
        default:
          return null;
      }
    },
  };
}

const STATUS_FOR_SESSION_EVENT = {
  "checkout.session.completed": "payment.completed",
  "checkout.session.expired": "payment.expired",
  "checkout.session.async_payment_failed": "payment.failed",
} as const satisfies Record<string, PaymentEvent["type"]>;
