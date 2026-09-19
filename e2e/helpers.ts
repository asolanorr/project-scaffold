import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery staple";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/**
 * Create an account and land on the dashboard.
 *
 * Sign-up is rate limited (Better Auth: a few per ten seconds per IP), and
 * the specs run in parallel from one address. On "too many attempts" this
 * waits out the window and tries again rather than failing a test that is
 * not about rate limiting.
 */
export async function signUp(page: Page, name = "E2E Runner"): Promise<string> {
  const email = uniqueEmail("e2e");

  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto("/sign-up");
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    const outcome = await Promise.race([
      page.waitForURL(/\/dashboard$/).then(() => "ok" as const),
      page
        .getByRole("alert")
        .filter({ hasText: "Too many attempts" })
        .waitFor()
        .then(() => "limited" as const),
    ]);
    if (outcome === "ok") return email;
    await page.waitForTimeout(11_000);
  }

  throw new Error("sign-up kept hitting the rate limit");
}

export async function expectSignedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/dashboard$/);
}
