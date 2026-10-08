import "server-only";

import { purgeStalePendingFiles } from "@/features/files/purge";
import { createCronJobHandler } from "./run-job";

/** Soft-deletes files rows still pending after the 24-hour upload window and
 * removes whatever storage object may exist at their key. See
 * `PENDING_UPLOAD_WINDOW_MS` and `purgeStalePendingFiles` in
 * apps/web/src/features/files/purge.ts. */
export const GET = createCronJobHandler("purge-pending-files", async (batchSize) => ({
  processed: await purgeStalePendingFiles(new Date(), batchSize),
}));
