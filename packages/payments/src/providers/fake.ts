import { createHmac, randomUUID } from "node:crypto";
import type { CheckoutParams, PaymentEvent, PaymentEventType, PaymentProvider } from "../provider";

const PAYMENT_EVENT_TYPES: readonly PaymentEventType[] = [
  "payment.completed",
  "payment.failed",
  "payment.expired",
  "payment.refunded",
];

export type FakePaymentsProvider = PaymentProvider & {
  /** Every `createCheckout` call, in order — assert what was actually sent
   * to the provider, in particular that the amount came from the database
   * and not from whatever a test's form data claimed. */
  readonly checkouts: CheckoutParams[];
  /** Build the signature header `verifyWebhook` accepts for this exact body. */
  sign(rawBody: string): string;
};

/**
 * A provider with no real wire format. `parseEvent` expects the raw body to
 * already be a `PaymentEvent` — tests construct the webhook body directly in
 * that normalized shape — so the fake exercises the verify → parse →
 * transition pipeline the app actually runs, without depending on Stripe's
 * event schema (that mapping is `providers/stripe.ts`'s own concern, tested
 * separately against fixtures of Stripe's real shape). It still returns null
 * for anything that is not one of this app's event types or is missing a
 * field the pipeline needs, the same as a real adapter would for an event it
 * does not fulfill orders from.
 */
export function createFakePayments(): FakePaymentsProvider {
  const checkouts: CheckoutParams[] = [];
  const secret = "fake-webhook-secret";

  function sign(rawBody: string): string {
    return createHmac("sha256", secret).update(rawBody).digest("hex");
  }

  return {
    name: "fake",
    checkouts,
    sign,

    async createCheckout(params: CheckoutParams) {
      checkouts.push(params);
      const providerReference = `cs_test_${checkouts.length}_${randomUUID()}`;
      return { url: `https://fake-checkout.test/${providerReference}`, providerReference };
    },

    verifyWebhook(rawBody: string, signatureHeader: string): unknown {
      if (signatureHeader !== sign(rawBody)) {
        throw new Error("fake payments: signature mismatch");
      }
      return JSON.parse(rawBody);
    },

    parseEvent(rawEvent: unknown): PaymentEvent | null {
      const event = rawEvent as Partial<PaymentEvent> | null;
      if (!event || !PAYMENT_EVENT_TYPES.includes(event.type as PaymentEventType)) return null;
      if (!event.id || !event.orderId || !event.providerReference) return null;
      return event as PaymentEvent;
    },
  };
}
