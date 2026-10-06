import { db, orders } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import {
  createFakePayments,
  type FakePaymentsProvider,
  setPaymentsProvider,
} from "@repo/payments/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheTags } from "@/lib/cache-tags";
import { seedUsers } from "../../projects/__tests__/fixtures";
import { insertOrder, seedPrice } from "./fixtures";

const updateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  updateTag: (tag: string) => updateTagMock(tag),
}));

vi.mock("server-only", () => ({}));

const { processPaymentWebhook } = await import("../webhook");

setupTestTransaction();

let fake: FakePaymentsProvider;

beforeEach(async () => {
  vi.clearAllMocks();
  fake = createFakePayments();
  setPaymentsProvider(fake);
  await seedUsers();
  await seedPrice();
});

afterEach(() => {
  setPaymentsProvider(undefined);
});

function completedEventBody(orderId: string, eventId = "evt_1") {
  return JSON.stringify({
    id: eventId,
    type: "payment.completed",
    orderId,
    providerReference: "cs_1",
  });
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

describe("processPaymentWebhook", () => {
  // Required case: a forged signature is rejected before anything is read
  // from the body, let alone written to the database.
  it("rejects a forged signature and touches nothing", async () => {
    const order = await insertOrder();
    const body = completedEventBody(order.id);

    const result = await processPaymentWebhook(body, "forged-signature");

    expect(result).toEqual({ ok: false, reason: "invalidSignature" });
    expect(await statusOf(order.id)).toBe("pending");
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("fulfills a pending order on a valid completed event", async () => {
    const order = await insertOrder();
    const body = completedEventBody(order.id);

    const result = await processPaymentWebhook(body, fake.sign(body));

    expect(result).toEqual({ ok: true });
    expect(await statusOf(order.id)).toBe("paid");
    expect(updateTagMock).toHaveBeenCalledWith(cacheTags.order(order.id));
  });

  // Required case: Stripe's at-least-once delivery means the same event can
  // arrive twice. The second delivery must still be answered 200 (`ok: true`)
  // — anything else makes the provider retry a webhook that already worked.
  it("answers ok for a duplicate event without reprocessing it", async () => {
    const order = await insertOrder();
    const body = completedEventBody(order.id);

    await processPaymentWebhook(body, fake.sign(body));
    updateTagMock.mockClear();
    const second = await processPaymentWebhook(body, fake.sign(body));

    expect(second).toEqual({ ok: true });
    expect(await statusOf(order.id)).toBe("paid");
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("answers ok for an event type this app does not act on", async () => {
    const order = await insertOrder();
    const body = JSON.stringify({ id: "evt_unrelated", type: "customer.created" });

    const result = await processPaymentWebhook(body, fake.sign(body));

    expect(result).toEqual({ ok: true });
    expect(await statusOf(order.id)).toBe("pending");
  });
});
