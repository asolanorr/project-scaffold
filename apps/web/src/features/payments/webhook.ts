import "server-only";

import type { OrderStatus } from "@repo/db";
import type { PaymentEventType } from "@repo/payments";
import { payments } from "@repo/payments";
import { updateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { transitionOrder } from "./transition";

const STATUS_FOR_EVENT = {
  "payment.completed": "paid",
  "payment.failed": "failed",
  "payment.expired": "expired",
  "payment.refunded": "refunded",
} as const satisfies Record<PaymentEventType, OrderStatus>;

export type WebhookResult =
  | { ok: true }
  /** Signature missing or forged — reject before a byte of the body is read. */
  | { ok: false; reason: "invalidSignature" };

/**
 * The only code path that fulfills an order. Pulled out of the route handler
 * so it is a plain async function: testable directly, with no `Request`/
 * `Response` plumbing or Next route machinery in the way.
 *
 * Verifies the signature first — `payments().verifyWebhook` throws on a
 * missing or forged one, and nothing below this line runs until it has not.
 * Everything after is idempotent: a duplicate event, an order that no longer
 * exists, and an event type this app does not act on all return `ok: true`
 * (so the provider does not retry a webhook that in fact succeeded), and only
 * `transitionOrder` ever writes an order's status.
 */
export async function processPaymentWebhook(
  rawBody: string,
  signatureHeader: string,
): Promise<WebhookResult> {
  let rawEvent: unknown;
  try {
    rawEvent = payments().verifyWebhook(rawBody, signatureHeader);
  } catch {
    return { ok: false, reason: "invalidSignature" };
  }

  const event = payments().parseEvent(rawEvent);
  if (!event) return { ok: true };

  const outcome = await transitionOrder({
    eventId: event.id,
    eventType: event.type,
    orderId: event.orderId,
    targetStatus: STATUS_FOR_EVENT[event.type],
    providerReference: event.providerReference,
  });

  if (outcome.status === "applied") updateTag(cacheTags.order(event.orderId));

  return { ok: true };
}
