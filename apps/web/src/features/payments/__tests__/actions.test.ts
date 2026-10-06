import { db, orders } from "@repo/db";
import { setupTestTransaction } from "@repo/db/testing";
import {
  createFakePayments,
  type FakePaymentsProvider,
  setPaymentsProvider,
} from "@repo/payments/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  form,
  OWNER,
  RedirectError,
  seedUsers,
  sessionFor,
} from "../../projects/__tests__/fixtures";
import { seedPrice } from "./fixtures";

const requireSessionMock = vi.fn();
vi.mock("@repo/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/auth")>()),
  requireSession: () => requireSessionMock(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
}));

const { createCheckoutOrder } = await import("../actions");

setupTestTransaction();

const initial = { ok: false } as const;

const signedInAs = (user: typeof OWNER) => requireSessionMock.mockResolvedValue(sessionFor(user));
const signedOut = () =>
  requireSessionMock.mockImplementation(() => {
    throw new RedirectError("/sign-in");
  });

let fake: FakePaymentsProvider;

beforeEach(async () => {
  vi.clearAllMocks();
  fake = createFakePayments();
  setPaymentsProvider(fake);
  await seedUsers();
});

afterEach(() => {
  setPaymentsProvider(undefined);
});

describe("createCheckoutOrder", () => {
  it("redirects an unauthenticated request before touching the database", async () => {
    signedOut();
    await seedPrice();

    await expect(createCheckoutOrder(initial, form({ priceId: "pro_monthly" }))).rejects.toThrow(
      "NEXT_REDIRECT:",
    );
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("answers priceNotFound for an unknown or inactive price", async () => {
    signedInAs(OWNER);
    await seedPrice({ active: false });

    const result = await createCheckoutOrder(initial, form({ priceId: "pro_monthly" }));

    expect(result).toEqual({ ok: false, code: "priceNotFound" });
    expect(fake.checkouts).toHaveLength(0);
  });

  // Required case: whatever the form claims about the amount is never what
  // gets charged. The price is read from `prices` by id; a forged amount or
  // currency field is simply not a field this schema accepts.
  it("ignores a client-supplied amount and charges the database price", async () => {
    signedInAs(OWNER);
    await seedPrice({ id: "pro_monthly", amountMinor: 1999, currency: "usd" });

    await expect(
      createCheckoutOrder(
        initial,
        form({ priceId: "pro_monthly", amountMinor: "1", amount: "1", currency: "jpy" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:");

    expect(fake.checkouts).toHaveLength(1);
    expect(fake.checkouts[0]).toMatchObject({ amountMinor: 1999, currency: "usd" });

    const [order] = await db.select().from(orders).where(eq(orders.priceId, "pro_monthly"));
    expect(order).toMatchObject({ amountMinor: 1999, currency: "usd", status: "pending" });
  });

  it("creates a pending order and redirects to the provider's checkout URL", async () => {
    signedInAs(OWNER);
    await seedPrice();

    const redirect = await createCheckoutOrder(initial, form({ priceId: "pro_monthly" })).catch(
      (error: unknown) => error,
    );

    expect(redirect).toBeInstanceOf(RedirectError);
    const [order] = await db.select().from(orders).where(eq(orders.buyerId, OWNER.id));
    expect(order?.providerReference).toBeTruthy();
    expect((redirect as RedirectError).to).toBe(
      `https://fake-checkout.test/${order?.providerReference}`,
    );
  });
});
