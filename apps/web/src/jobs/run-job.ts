import "server-only";

import { timingSafeEqual } from "node:crypto";
import { env } from "@repo/env";
import { captureJobFailure } from "@/lib/sentry";

/**
 * How many rows a single job invocation may touch. Shared across every job
 * so the cap is one decision, not one per job: a backlog larger than this is
 * cleared over several ticks of the cron schedule, not in one call that risks
 * running past the function timeout.
 */
export const MAX_JOB_BATCH_SIZE = 500;

export type JobOutcome = { processed: number };
export type JobRunner = (batchSize: number) => Promise<JobOutcome>;

/**
 * The one wrapper every job route goes through: verifies the `CRON_SECRET`
 * bearer token, logs the start and the outcome, passes the shared batch cap
 * down to the job, and reports a thrown error to Sentry instead of letting it
 * surface as a bare 500 nobody sees.
 *
 * `run` does the actual work and returns how many rows it touched — it never
 * knows about the HTTP layer, which is what makes it testable by itself (see
 * `purge-pending-files.ts`).
 */
//#region run
export function createCronJobHandler(
  name: string,
  run: JobRunner,
): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    if (!isAuthorized(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startedAt = Date.now();
    console.log(`[jobs:${name}] started`);

    try {
      const outcome = await run(MAX_JOB_BATCH_SIZE);
      console.log(`[jobs:${name}] finished`, {
        processed: outcome.processed,
        ms: Date.now() - startedAt,
      });
      return Response.json({ ok: true, processed: outcome.processed });
    } catch (error) {
      console.error(`[jobs:${name}] failed`, error);
      captureJobFailure(name, error);
      return Response.json({ ok: false }, { status: 500 });
    }
  };
}
//#endregion

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return timingSafeEqualString(header.slice("Bearer ".length), env.CRON_SECRET);
}

/** `timingSafeEqual` throws on a length mismatch rather than returning
 * false, and a bearer token's length is itself not secret, so the length
 * check here is safe to short-circuit on. */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
