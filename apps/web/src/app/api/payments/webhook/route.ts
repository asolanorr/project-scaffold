import { processPaymentWebhook } from "@/features/payments/webhook";

/**
 * Stripe's webhook. Sits outside `[locale]` like the auth route — this is an
 * API endpoint, not a page, and the middleware matcher excludes `/api` so
 * nothing here gets locale-rewritten.
 *
 * All the logic lives in `processPaymentWebhook`; this handler only reads
 * the raw body (signature verification needs the exact bytes Stripe signed,
 * not a body Next has already parsed as JSON) and translates the result to
 * an HTTP response.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();
  const result = await processPaymentWebhook(rawBody, signature);
  if (!result.ok) return new Response("Invalid signature", { status: 400 });

  return new Response(null, { status: 200 });
}
