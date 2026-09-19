/**
 * Every string an email can contain, per locale.
 *
 * Not next-intl: mail is sent from Better Auth callbacks and background
 * tasks, where there is no request and no `useTranslations`. The shape is
 * checked at compile time instead — `es` must have every key `en` has.
 */
export const EMAIL_LOCALES = ["en", "es"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const DEFAULT_EMAIL_LOCALE: EmailLocale = "en";

export function isEmailLocale(value: unknown): value is EmailLocale {
  return EMAIL_LOCALES.includes(value as EmailLocale);
}

/** Narrow anything (a header, a column) to a locale, falling back to English. */
export function toEmailLocale(value: unknown): EmailLocale {
  return isEmailLocale(value) ? value : DEFAULT_EMAIL_LOCALE;
}

type Messages = {
  common: {
    greeting: (name: string) => string;
    ignore: string;
    buttonFallback: string;
    signature: string;
  };
  verifyEmail: { subject: string; preview: string; body: string; button: string; expiry: string };
  passwordReset: { subject: string; preview: string; body: string; button: string; expiry: string };
  passwordChanged: {
    subject: string;
    preview: string;
    body: (when: string) => string;
    action: string;
    button: string;
  };
};

const en: Messages = {
  common: {
    greeting: (name: string) => `Hi ${name},`,
    ignore: "If you did not request this, you can ignore this email.",
    buttonFallback: "If the button does not work, copy this link into your browser:",
    signature: "— The Scaffold team",
  },
  verifyEmail: {
    subject: "Verify your email address",
    preview: "One click to finish creating your account.",
    body: "Thanks for signing up. Confirm this address to finish creating your account.",
    button: "Verify email",
    expiry: "This link is valid for 24 hours and works once.",
  },
  passwordReset: {
    subject: "Reset your password",
    preview: "A link to choose a new password.",
    body: "Someone asked to reset the password for your account. If that was you, choose a new one here.",
    button: "Reset password",
    expiry: "This link is valid for 1 hour and works once.",
  },
  passwordChanged: {
    subject: "Your password was changed",
    preview: "A confirmation that your password changed.",
    body: (when: string) => `The password for your account was changed on ${when}.`,
    action:
      "If this was you, nothing else is needed. If it was not, reset your password now and contact us.",
    button: "Reset password",
  },
};

const es: Messages = {
  common: {
    greeting: (name) => `Hola ${name}:`,
    ignore: "Si no solicitaste esto, puedes ignorar este correo.",
    buttonFallback: "Si el botón no funciona, copia este enlace en tu navegador:",
    signature: "— El equipo de Scaffold",
  },
  verifyEmail: {
    subject: "Verifica tu dirección de correo",
    preview: "Un clic para terminar de crear tu cuenta.",
    body: "Gracias por registrarte. Confirma esta dirección para terminar de crear tu cuenta.",
    button: "Verificar correo",
    expiry: "Este enlace es válido durante 24 horas y funciona una sola vez.",
  },
  passwordReset: {
    subject: "Restablece tu contraseña",
    preview: "Un enlace para elegir una nueva contraseña.",
    body: "Alguien pidió restablecer la contraseña de tu cuenta. Si fuiste tú, elige una nueva aquí.",
    button: "Restablecer contraseña",
    expiry: "Este enlace es válido durante 1 hora y funciona una sola vez.",
  },
  passwordChanged: {
    subject: "Tu contraseña fue cambiada",
    preview: "Confirmación de que tu contraseña cambió.",
    body: (when) => `La contraseña de tu cuenta fue cambiada el ${when}.`,
    action:
      "Si fuiste tú, no necesitas hacer nada más. Si no, restablece tu contraseña ahora y contáctanos.",
    button: "Restablecer contraseña",
  },
};

export const messages: Record<EmailLocale, Messages> = { en, es };

export type EmailMessages = Messages;
