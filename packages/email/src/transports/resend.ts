import { Resend } from "resend";
import type { EmailTransport } from "../transport";

/**
 * The only file in the repository that imports `resend`. Swapping providers
 * is a new transport here and one line in `../index`.
 */
export function createResendTransport(apiKey: string): EmailTransport {
  const client = new Resend(apiKey);
  return {
    name: "resend",
    async send(payload) {
      const { error } = await client.emails.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
      // Resend reports failures in the body, not by throwing; a caller that
      // awaits this expects a rejection when nothing was sent.
      if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
    },
  };
}
