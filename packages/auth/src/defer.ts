import { after } from "next/server";

/**
 * Run work after the response has been sent.
 *
 * Sending mail must not hold up a sign-up or a reset request: the user is
 * waiting on the response, and the provider's latency (or outage) is not
 * theirs to bear. `after()` hands the task to Next, which keeps the function
 * alive until it settles — on serverless, plain fire-and-forget can be frozen
 * mid-flight when the response goes out.
 *
 * Outside a request scope (a test, a script) `after()` throws; the task then
 * runs immediately in the background instead, which is the same contract
 * without the platform guarantee.
 */
export function deferred(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((error: unknown) => console.error("[auth] deferred task failed", error));
  try {
    after(run);
  } catch {
    void run();
  }
}
