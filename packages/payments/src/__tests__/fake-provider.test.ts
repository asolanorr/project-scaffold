import { describe, expect, it } from "vitest";
import { createFakePayments } from "../providers/fake";

describe("createFakePayments", () => {
  it("records every createCheckout call for assertions", async () => {
    const fake = createFakePayments();

    const session = await fake.createCheckout({
      orderId: "order_1",
      amountMinor: 1999,
      currency: "usd",
      productName: "Pro plan",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    expect(fake.checkouts).toEqual([
      expect.objectContaining({ orderId: "order_1", amountMinor: 1999, currency: "usd" }),
    ]);
    expect(session.providerReference).toBeTruthy();
    expect(session.url).toContain(session.providerReference);
  });

  it("verifies a correctly signed body and rejects a forged one", () => {
    const fake = createFakePayments();
    const body = JSON.stringify({ id: "evt_1", type: "payment.completed" });

    expect(fake.verifyWebhook(body, fake.sign(body))).toEqual({
      id: "evt_1",
      type: "payment.completed",
    });
    expect(() => fake.verifyWebhook(body, "forged-signature")).toThrow();
  });

  it("parses a verified event as the already-normalized PaymentEvent it is", () => {
    const fake = createFakePayments();
    const raw = {
      id: "evt_1",
      type: "payment.completed",
      orderId: "order_1",
      providerReference: "cs_1",
    };

    expect(fake.parseEvent(raw)).toEqual(raw);
  });
});
