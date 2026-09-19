import { defineConfig, devices } from "@playwright/test";

/**
 * Two ways to run:
 *
 *   BASE_URL=https://<preview>.vercel.app pnpm test:e2e   — CI, against a deployment
 *   pnpm test:e2e                                          — local, starts `next dev`
 *
 * The CI job is triggered by the `deployment_status` event and passes the
 * preview URL in; see .github/workflows/e2e.yml.
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Preview deployments are behind Vercel Deployment Protection; this
    // header is how an automated client gets through. Absent locally.
    extraHTTPHeaders: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only when no deployment was given: bring the app up locally and reuse
  // one that is already running.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @repo/web dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
