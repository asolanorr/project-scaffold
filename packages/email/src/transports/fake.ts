import type { EmailPayload, EmailTransport } from "../transport";

export type FakeTransport = EmailTransport & {
  /** Every payload handed to `send`, oldest first. */
  readonly sent: EmailPayload[];
  /** The most recent payload, or a failing assertion's worth of undefined. */
  last(): EmailPayload | undefined;
  /** Resolves once `count` messages have been sent — for fire-and-forget callers. */
  waitFor(count: number, timeoutMs?: number): Promise<EmailPayload[]>;
  clear(): void;
};

/**
 * Records instead of delivering. Tests assert on `sent`; nothing touches the
 * network. `onSend` can hold a send open to test that callers do not wait.
 */
export function createFakeTransport(
  onSend?: (payload: EmailPayload) => Promise<void>,
): FakeTransport {
  const sent: EmailPayload[] = [];
  const waiters: Array<{ count: number; resolve: (sent: EmailPayload[]) => void }> = [];

  return {
    name: "fake",
    sent,
    async send(payload) {
      sent.push(payload);
      for (const waiter of [...waiters]) {
        if (sent.length >= waiter.count) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve([...sent]);
        }
      }
      await onSend?.(payload);
    },
    last: () => sent.at(-1),
    waitFor(count, timeoutMs = 2000) {
      if (sent.length >= count) return Promise.resolve([...sent]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`expected ${count} email(s), got ${sent.length}`)),
          timeoutMs,
        );
        waiters.push({
          count,
          resolve: (all) => {
            clearTimeout(timer);
            resolve(all);
          },
        });
      });
    },
    clear() {
      sent.length = 0;
    },
  };
}
