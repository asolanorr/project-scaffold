import { env } from "@repo/env";
import type { PaymentProvider } from "./provider";
import { createStripeProvider } from "./providers/stripe";

export type {
  CheckoutParams,
  CheckoutSession,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
} from "./provider";

let provider: PaymentProvider | undefined;

/** Replace the provider. Tests install a fake; nothing else should call this. */
export function setPaymentsProvider(
  next: PaymentProvider | undefined,
): PaymentProvider | undefined {
  const previous = provider;
  provider = next;
  return previous;
}

function defaultProvider(): PaymentProvider {
  // Optional in the schema (local dev and CI run without Stripe credentials,
  // see @repo/payments/testing), so the clear failure lives here instead of a
  // crash at import time — only an attempt to actually create a checkout or
  // verify a webhook fails, and it fails with a message that names what to set.
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "Payments: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are not set. " +
        "Set both, or call setPaymentsProvider() with a provider (tests use " +
        "createFakePayments() from @repo/payments/testing).",
    );
  }
  return createStripeProvider({
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  });
}

/** The active payment provider. */
export function payments(): PaymentProvider {
  provider ??= defaultProvider();
  return provider;
}
