import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// The reset flow up to the point where an inbox is needed. The link itself
// is covered by the packages/auth tests against a fake transport; here the
// pages, the messages and the "same answer either way" rule are what matter.

test("forgot password answers the same whether or not the address exists", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("nobody@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If an account exists for nobody@example.test",
  );

  // Now a real account. Sign out first, and wait for it: a signed-in visitor
  // is bounced away from the auth pages.
  const email = await signUp(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(`If an account exists for ${email}`);
});

test("the reset page without a token points back to forgot password", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText(
    "This link is incomplete",
  );
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("a used or unknown reset token is refused", async ({ page }) => {
  await page.goto("/api/auth/reset-password/not-a-real-token?callbackURL=/reset-password");
  await expect(page).toHaveURL(/\/reset-password\?error=/);
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("no longer valid");
});

test("the pages are translated", async ({ page }) => {
  await page.goto("/es/forgot-password");
  await expect(page.getByRole("heading", { name: "¿Olvidaste tu contraseña?" })).toBeVisible();
  await page.goto("/es/check-email?email=a%40b.test");
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await expect(page.getByText("Enviamos un enlace de verificación a a@b.test")).toBeVisible();
});
