/**
 * What actually delivers a rendered message. Three implementations: Resend
 * (production), the console (development without a key), and a fake that
 * records payloads (tests, from `@repo/email/testing`).
 */
export type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Which template produced it — for logs and assertions, never sent. */
  template: string;
};

export type EmailTransport = {
  readonly name: string;
  send(payload: EmailPayload): Promise<void>;
};
