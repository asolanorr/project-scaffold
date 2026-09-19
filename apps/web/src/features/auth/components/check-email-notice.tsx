import { getTranslations } from "next-intl/server";
import { ResendVerificationForm } from "./resend-verification-form";

/**
 * "We sent a link to X" plus a resend form. The address comes from the query
 * string the sign-up action redirected with; it is the user's own, just
 * typed, so showing it back is fine. The resend endpoint has its own rate
 * limit, so the form can be plain.
 */
export async function CheckEmailNotice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("auth.checkEmail");
  const raw = (await searchParams).email;
  const email = typeof raw === "string" && raw.includes("@") ? raw : undefined;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-md text-tertiary">
        {email ? t("subtitle", { email }) : t("subtitleNoEmail")}
      </p>
      <ResendVerificationForm defaultEmail={email} />
    </div>
  );
}
