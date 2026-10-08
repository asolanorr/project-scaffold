import { env } from "@repo/env";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captureJobFailureMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureJobFailure: (job: string, error: unknown) => captureJobFailureMock(job, error),
}));

const { createCronJobHandler, MAX_JOB_BATCH_SIZE } = await import("../run-job");

const authHeader = { authorization: `Bearer ${env.CRON_SECRET}` };

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/jobs/example", { headers });
}

describe("createCronJobHandler", () => {
  // Required case: an unauthenticated call returns 401.
  it("rejects a request with no bearer token", async () => {
    const run = vi.fn();
    const handler = createCronJobHandler("example", run);

    const response = await handler(request());

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong token", async () => {
    const run = vi.fn();
    const handler = createCronJobHandler("example", run);

    const response = await handler(request({ authorization: "Bearer wrong-token" }));

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a non-bearer authorization header", async () => {
    const run = vi.fn();
    const handler = createCronJobHandler("example", run);

    const response = await handler(request({ authorization: env.CRON_SECRET }));

    expect(response.status).toBe(401);
  });

  it("runs the job with the shared batch cap, logs, and reports the outcome", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue({ processed: 7 });
    const handler = createCronJobHandler("example", run);

    const response = await handler(request(authHeader));

    expect(run).toHaveBeenCalledWith(MAX_JOB_BATCH_SIZE);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 7 });
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("started"));
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("finished"),
      expect.objectContaining({ processed: 7 }),
    );
    consoleLog.mockRestore();
  });

  // Required case: a job failure is reported to Sentry rather than
  // surfacing as a bare 500 with nothing else watching.
  it("reports a thrown error to Sentry and answers 500", async () => {
    const error = new Error("boom");
    const run = vi.fn().mockRejectedValue(error);
    const handler = createCronJobHandler("example", run);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handler(request(authHeader));

    expect(response.status).toBe(500);
    expect(captureJobFailureMock).toHaveBeenCalledWith("example", error);
    consoleError.mockRestore();
  });
});
