import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeProvider } from "../providers/stripe";

const secretKey = "sk_test_fixture";
const webhookSecret = "whsec_fixture";
const stripe = new Stripe(secretKey);

function sign(payload: string, secret = webhookSecret): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

describe("createStripeProvider.verifyWebhook", () => {
  it("accepts a correctly signed payload", () => {
    const provider = createStripeProvider({ secretKey, webhookSecret });
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

    const event = provider.verifyWebhook(payload, sign(payload)) as Stripe.Event;

    expect(event.id).toBe("evt_1");
  });

  // Required case: a forged (or simply wrong-secret) signature is rejected.
  it("rejects a payload signed with the wrong secret", () => {
    const provider = createStripeProvider({ secretKey, webhookSecret });
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

    expect(() =>
      provider.verifyWebhook(payload, sign(payload, "whsec_someone_elses_secret")),
    ).toThrow();
  });

  it("rejects a forged signature header outright", () => {
    const provider = createStripeProvider({ secretKey, webhookSecret });
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

    expect(() => provider.verifyWebhook(payload, "t=1,v1=not-a-real-signature")).toThrow();
  });

  it("rejects a payload altered after signing", () => {
    const provider = createStripeProvider({ secretKey, webhookSecret });
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const header = sign(payload);
    const tampered = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      amount: 999999,
    });

    expect(() => provider.verifyWebhook(tampered, header)).toThrow();
  });
});

describe("createStripeProvider.parseEvent", () => {
  const provider = createStripeProvider({ secretKey, webhookSecret });

  function sessionEvent(type: Stripe.Event["type"], metadata: Record<string, string> | null) {
    return {
      id: "evt_session",
      type,
      data: { object: { id: "cs_test_1", metadata } },
    } as unknown as Stripe.Event;
  }

  it("maps checkout.session.completed to payment.completed", () => {
    expect(
      provider.parseEvent(sessionEvent("checkout.session.completed", { orderId: "order_1" })),
    ).toEqual({
      id: "evt_session",
      type: "payment.completed",
      orderId: "order_1",
      providerReference: "cs_test_1",
    });
  });

  it("maps checkout.session.expired to payment.expired", () => {
    expect(
      provider.parseEvent(sessionEvent("checkout.session.expired", { orderId: "order_1" })),
    ).toMatchObject({
      type: "payment.expired",
      orderId: "order_1",
    });
  });

  it("maps checkout.session.async_payment_failed to payment.failed", () => {
    expect(
      provider.parseEvent(
        sessionEvent("checkout.session.async_payment_failed", { orderId: "order_1" }),
      ),
    ).toMatchObject({ type: "payment.failed", orderId: "order_1" });
  });

  it("maps charge.refunded to payment.refunded using the payment intent as the reference", () => {
    const event = {
      id: "evt_refund",
      type: "charge.refunded",
      data: {
        object: { id: "ch_1", metadata: { orderId: "order_1" }, payment_intent: "pi_1" },
      },
    } as unknown as Stripe.Event;

    expect(provider.parseEvent(event)).toEqual({
      id: "evt_refund",
      type: "payment.refunded",
      orderId: "order_1",
      providerReference: "pi_1",
    });
  });

  it("ignores a session event with no orderId metadata", () => {
    expect(provider.parseEvent(sessionEvent("checkout.session.completed", null))).toBeNull();
  });

  it("ignores event types this app does not fulfill orders from", () => {
    const event = {
      id: "evt_other",
      type: "customer.created",
      data: { object: {} },
    } as unknown as Stripe.Event;

    expect(provider.parseEvent(event)).toBeNull();
  });
});
