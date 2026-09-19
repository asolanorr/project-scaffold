import { render } from "@react-email/render";
import { env } from "@repo/env";
import type { ReactElement } from "react";
import { type EmailLocale, toEmailLocale } from "./messages";
import {
  PasswordChanged,
  type PasswordChangedProps,
  passwordChangedSubject,
} from "./templates/password-changed";
import {
  PasswordReset,
  type PasswordResetProps,
  passwordResetSubject,
} from "./templates/password-reset";
import { VerifyEmail, type VerifyEmailProps, verifyEmailSubject } from "./templates/verify-email";
import type { EmailPayload, EmailTransport } from "./transport";
import { createConsoleTransport } from "./transports/console";
import { createResendTransport } from "./transports/resend";

export { EMAIL_LOCALES, type EmailLocale, isEmailLocale, toEmailLocale } from "./messages";
export type { EmailPayload, EmailTransport } from "./transport";

/**
 * The templates, keyed by name. Adding one: a component under ./templates, a
 * subject function, and an entry here; `sendEmail` then accepts it with typed
 * props.
 */
const templates = {
  verifyEmail: {
    render: (locale: EmailLocale, props: VerifyEmailProps) =>
      VerifyEmail({ locale, ...props }) as ReactElement,
    subject: verifyEmailSubject,
  },
  passwordReset: {
    render: (locale: EmailLocale, props: PasswordResetProps) =>
      PasswordReset({ locale, ...props }) as ReactElement,
    subject: passwordResetSubject,
  },
  passwordChanged: {
    render: (locale: EmailLocale, props: PasswordChangedProps) =>
      PasswordChanged({ locale, ...props }) as ReactElement,
    subject: passwordChangedSubject,
  },
} as const;

export type EmailTemplate = keyof typeof templates;

type TemplateProps<T extends EmailTemplate> = Parameters<(typeof templates)[T]["render"]>[1];

export type SendEmailInput<T extends EmailTemplate = EmailTemplate> = {
  to: string;
  template: T;
  props: TemplateProps<T>;
  /** Anything; unknown values fall back to English. */
  locale: string | null | undefined;
};

let transport: EmailTransport | undefined;

/**
 * Replace the transport. Tests install a fake; nothing else should call this.
 * Returns the previous transport so a test can restore it.
 */
export function setEmailTransport(next: EmailTransport | undefined): EmailTransport | undefined {
  const previous = transport;
  transport = next;
  return previous;
}

function defaultTransport(): EmailTransport {
  if (env.RESEND_API_KEY) return createResendTransport(env.RESEND_API_KEY);
  // No key, and env has already refused to boot production without one, so
  // this is development or a preview that chose not to send.
  return createConsoleTransport();
}

function currentTransport(): EmailTransport {
  transport ??= defaultTransport();
  return transport;
}

/**
 * The one way to send mail.
 *
 * Renders the template for the locale, then hands the payload to whatever
 * transport is installed. Awaiting it means awaiting delivery; a caller in a
 * request should not — schedule it after the response instead (the auth
 * package does this with `after()` from next/server).
 */
export async function sendEmail<T extends EmailTemplate>(
  input: SendEmailInput<T>,
): Promise<EmailPayload> {
  const locale = toEmailLocale(input.locale);
  const entry = templates[input.template];
  // The props type is exact per template at the call site; inside the table
  // TypeScript sees the union, hence the cast to the entry's own parameter.
  const element = entry.render(locale, input.props as never);

  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const payload: EmailPayload = {
    from: env.EMAIL_FROM,
    to: input.to,
    subject: entry.subject(locale),
    html,
    text,
    template: input.template,
  };

  await currentTransport().send(payload);
  return payload;
}
