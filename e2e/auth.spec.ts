import { expect, test } from "@playwright/test";

// The main user flow, end to end, against a real deployment with a real
// database. Each run creates its own account: preview databases hold synthetic
// data only, and the address is unique enough that runs never collide.
const password = "correct horse battery staple";

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
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

    await page.goto("/sign-up");
    await page.getByRole("textbox", { name: "Name" }).fill("E2E Runner");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

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
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveText(
      "Those details do not match an account.",
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
