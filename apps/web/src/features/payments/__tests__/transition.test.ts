import { db, orders, processedEvents } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { seedUsers } from "../../projects/__tests__/fixtures";
import { insertOrder, seedPrice } from "./fixtures";

vi.mock("server-only", () => ({}));

const { transitionOrder } = await import("../transition");

setupTestTransaction();

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

describe("transitionOrder", () => {
  it("applies a legal transition and records the event in the same write", async () => {
    await seedUsers();
    await seedPrice();
    const order = await insertOrder();

    const outcome = await transitionOrder({
      eventId: "evt_1",
      eventType: "payment.completed",
      orderId: order.id,
      targetStatus: "paid",
      providerReference: "cs_1",
    });

    expect(outcome).toMatchObject({ status: "applied", order: { status: "paid" } });
    const [event] = await db.select().from(processedEvents).where(eq(processedEvents.id, "evt_1"));
    expect(event?.orderId).toBe(order.id);
  });

  // Required case: a retried webhook (same provider event id) is processed
  // exactly once. The second call must not re-run the transition — if it
  // did, re-applying "paid" would at least be harmless, but the real risk is
  // a retry of a DIFFERENT target being allowed to run twice.
  it("processes a duplicate event exactly once", async () => {
    await seedUsers();
    await seedPrice();
    const order = await insertOrder();

    const first = await transitionOrder({
      eventId: "evt_dup",
      eventType: "payment.completed",
      orderId: order.id,
      targetStatus: "paid",
      providerReference: "cs_1",
    });
    const second = await transitionOrder({
      eventId: "evt_dup",
      eventType: "payment.completed",
      orderId: order.id,
      targetStatus: "paid",
      providerReference: "cs_1",
    });

    expect(first.status).toBe("applied");
    expect(second).toEqual({ status: "duplicate" });
    expect(await statusOf(order.id)).toBe("paid");
    const events = await db.select().from(processedEvents).where(eq(processedEvents.id, "evt_dup"));
    expect(events).toHaveLength(1);
  });

  // Required case: events land out of their real-world order (a stale
  // "expired" delivered after "completed" already paid the order; a
  // reordered "refunded" delivered before the "completed" that must precede
  // it) and the order still ends up in the one correct final state.
  describe("out-of-order delivery", () => {
    it("ignores a stale expired event that arrives after the order was already paid", async () => {
      await seedUsers();
      await seedPrice();
      const order = await insertOrder();

      await transitionOrder({
        eventId: "evt_completed",
        eventType: "payment.completed",
        orderId: order.id,
        targetStatus: "paid",
        providerReference: "cs_1",
      });
      const late = await transitionOrder({
        eventId: "evt_expired_late",
        eventType: "payment.expired",
        orderId: order.id,
        targetStatus: "expired",
        providerReference: "cs_1",
      });

      expect(late).toMatchObject({ status: "ignored" });
      expect(await statusOf(order.id)).toBe("paid");
    });

    it("ignores a premature refund that arrives before the completed event, then applies completed normally", async () => {
      await seedUsers();
      await seedPrice();
      const order = await insertOrder();

      const prematureRefund = await transitionOrder({
        eventId: "evt_refund_early",
        eventType: "payment.refunded",
        orderId: order.id,
        targetStatus: "refunded",
        providerReference: "cs_1",
      });
      const completed = await transitionOrder({
        eventId: "evt_completed",
        eventType: "payment.completed",
        orderId: order.id,
        targetStatus: "paid",
        providerReference: "cs_1",
      });

      expect(prematureRefund).toMatchObject({ status: "ignored" });
      expect(completed).toMatchObject({ status: "applied" });
      expect(await statusOf(order.id)).toBe("paid");
    });
  });

  it("reports orderNotFound for an event on an order that does not exist", async () => {
    await seedUsers();

    const outcome = await transitionOrder({
      eventId: "evt_1",
      eventType: "payment.completed",
      orderId: "00000000-0000-0000-0000-000000000000",
      targetStatus: "paid",
      providerReference: "cs_1",
    });

    expect(outcome).toEqual({ status: "orderNotFound" });
  });
});
