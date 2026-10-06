import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { OrderStatus } from "@/features/payments/components/order-status";
import { resolveLocale } from "@/lib/locale";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string }>;
}) {
  setRequestLocale(await resolveLocale(params));
  const { orderId } = await searchParams;
  const t = await getTranslations("checkout.success");

  return (
    <main className="mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-12 md:px-8">
      <Suspense fallback={<p className="text-md text-tertiary">{t("title")}</p>}>
        <OrderStatus orderId={orderId} />
      </Suspense>
    </main>
  );
}
