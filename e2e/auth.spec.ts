import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// The main user flow, end to end, against a real deployment with a real
// database. Each run creates its own account: preview databases hold synthetic
// data only, and the address is unique enough that runs never collide.

// Fields are found by role and accessible name rather than by label text: the
// label element also carries a visually hidden required marker, and the
// password field has a toggle button whose aria-label mentions "password".

test.describe("auth", () => {
  test("sign-in page renders in both locales", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();

    await page.goto("/es/sign-in");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("sign up, land on the dashboard, sign out", async ({ page }) => {
    const email = await signUp(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    // The session is gone: the protected page bounces back to sign-in.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("rejects a wrong password without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: "Email" }).fill("nobody@example.test");
    await page.getByRole("textbox", { name: "Password" }).fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next mounts its own empty route announcer with role="alert"; match the text.
    // Generous timeout: the rate limiter stores its counters in the database,
    // and with the other specs signing up in parallel this round trip is the
    // slowest thing in the suite.
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText(
      "Those details do not match an account.",
      { timeout: 15_000 },
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
