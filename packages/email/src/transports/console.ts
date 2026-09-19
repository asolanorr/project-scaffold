import type { EmailTransport } from "../transport";

/**
 * Development without a provider: print the message so the link in it can be
 * clicked from the terminal. The plain-text body is what gets printed; the
 * HTML would be noise.
 */
export function createConsoleTransport(
  log: (message: string) => void = (message) => console.log(message),
): EmailTransport {
  return {
    name: "console",
    async send(payload) {
      log(
        [
          "",
          `email (${payload.template}) -> ${payload.to}`,
          `  from:    ${payload.from}`,
          `  subject: ${payload.subject}`,
          "",
          payload.text.replace(/^/gm, "  "),
          "",
        ].join("\n"),
      );
    },
  };
}
