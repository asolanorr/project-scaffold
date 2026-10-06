/**
 * What a payment provider has to offer the checkout and webhook flow. Stripe
 * in production, a fake in tests; a second provider (Tilopay, for the Costa
 * Rican and Central American market — see ARCHITECTURE.md §8) is a new file
 * under ./providers and one line in ./index, never a second code path in the
 * checkout action or the webhook route.
 */

export type CheckoutParams = {
  /** This app's order id. Round-trips through the provider as metadata so a
   * webhook can be matched back to the order without trusting anything the
   * browser sends on the redirect. */
  orderId: string;
  /** Integer minor units (cents) — never a float, never client-supplied. */
  amountMinor: number;
  /** ISO 4217, lowercase (e.g. "usd"). */
  currency: string;
  productName: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  /** Where to send the browser to pay. */
  url: string;
  /** The provider's id for this checkout attempt (Stripe: the Session id). */
  providerReference: string;
};

/** The order-lifecycle events this app acts on. Anything else a provider
 * sends is not fulfillment-relevant and `parseEvent` returns null for it. */
export type PaymentEventType =
  | "payment.completed"
  | "payment.failed"
  | "payment.expired"
  | "payment.refunded";

export type PaymentEvent = {
  /** The provider's event id — the idempotency key `processed_events` is
   * keyed by. */
  id: string;
  type: PaymentEventType;
  orderId: string;
  providerReference: string;
};

export type PaymentProvider = {
  readonly name: string;
  /** Read the price from the database, never the request, before calling
   * this — `amountMinor` here is what the customer is actually charged. */
  createCheckout(params: CheckoutParams): Promise<CheckoutSession>;
  /**
   * Verify the webhook's signature and return the provider's own parsed
   * event. Throws on a missing or forged signature. Deliberately separate
   * from `parseEvent`: this is the only place that touches cryptography, and
   * it has to run — and pass — before a single byte of the body is trusted.
   */
  verifyWebhook(rawBody: string, signatureHeader: string): unknown;
  /**
   * Map an already-verified provider event to the normalized shape this app
   * acts on, or null for an event type this app does not fulfill orders from
   * (e.g. Stripe sends dozens of event types; most are not ours to handle).
   * Pure and synchronous — no crypto, no network — so it is tested with
   * plain fixtures.
   */
  parseEvent(rawEvent: unknown): PaymentEvent | null;
};
