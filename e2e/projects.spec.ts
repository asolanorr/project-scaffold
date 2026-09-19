import { expect, type Page, test } from "@playwright/test";
import { signUp } from "./helpers";

// The reference feature, end to end: sign in → create → filter → edit →
// delete → undo. One account per run, created here, so runs never collide.

async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("projects: create, filter, edit, delete and undo", async ({ page }) => {
  await signUp(page);

  // Empty state on a fresh account.
  await page.goto("/projects");
  await expect(page.getByRole("grid", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();

  await createProject(page, "Alpha");
  await createProject(page, "Beta");

  // Filter by name: the URL carries it, so the view is shareable.
  await page.goto("/projects");
  const grid = page.getByRole("grid", { name: "Projects" });
  await expect(grid.getByRole("row", { name: /Alpha/ })).toBeVisible();
  await expect(grid.getByRole("row", { name: /Beta/ })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search by name" }).fill("Alp");
  await expect(page).toHaveURL(/[?&]q=Alp/);
  await expect(grid.getByRole("row", { name: /Alpha/ })).toBeVisible();
  await expect(grid.getByRole("row", { name: /Beta/ })).toHaveCount(0);

  // Filter by status: nothing is active yet, so the filtered empty state.
  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("option", { name: "Active" }).click();
  await expect(page).toHaveURL(/[?&]status=active/);
  await expect(page.getByText("No projects match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(grid.getByRole("row", { name: /Beta/ })).toBeVisible();

  // Back button steps through the URL history.
  await page.goBack();
  await expect(page).toHaveURL(/[?&]status=active/);
  await page.goForward();

  // Edit.
  await grid.getByRole("link", { name: "Alpha" }).click();
  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("textbox", { name: "Name" }).fill("Alpha 2");
  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("option", { name: "Active" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Alpha 2" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  // Validation runs in the browser before anything is sent.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("x");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Too short.")).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("link", { name: "Cancel" }).click();

  // Delete behind a confirmation, then undo from the toast.
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this project?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(grid.getByRole("row", { name: /Alpha 2/ })).toHaveCount(0);

  const toasts = page.getByRole("region", { name: "Notifications" });
  await expect(toasts.getByText("Project deleted")).toBeVisible();
  await toasts.getByRole("button", { name: "Undo" }).click();
  await expect(toasts.getByText("Project restored")).toBeVisible();
  await expect(grid.getByRole("row", { name: /Alpha 2/ })).toBeVisible();
});

test("projects: another user's project is not found", async ({ page, browser }) => {
  await signUp(page);
  await createProject(page, "Private");
  const url = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUp(otherPage);
  await otherPage.goto(url);
  await expect(otherPage.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await other.close();
});
