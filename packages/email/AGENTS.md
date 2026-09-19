# packages/email

Transactional email: templates, locales, and the one function that sends.

## Rules

- **`sendEmail({ to, template, props, locale })` is the only way mail leaves
  the app.** Nothing else imports `resend`; `src/transports/resend.ts` is the
  single importer, and swapping providers is a new transport there.
- **Never await a send inside a request.** Callers in Better Auth callbacks
  and Server Actions schedule it after the response — `deferred()` in
  `packages/auth/src/defer.ts` wraps Next's `after()`. Awaiting delivery
  makes the provider's latency the user's.
- **Strings live in `src/messages.ts`, both locales, typed so `es` cannot
  miss a key `en` has.** No next-intl here: mail is sent where there is no
  request. Templates take `locale` and read from that catalog.
- **Locale choice is the caller's, and the rule is:** mail the user asked for
  in a request (verification on sign-up, a reset link) is written in the
  request's locale; mail they did not ask for (the password-changed notice)
  is written in the account's stored `users.locale`. Anything unknown falls
  back to English.
- **Tests use the fake transport** from `@repo/email/testing`:
  `setEmailTransport(createFakeTransport())`, then assert on `fake.sent`.
  Never the network.

## Adding a template

1. `src/templates/<name>.tsx`: a component taking `locale` plus its props,
   built on `Layout`; a `<name>Subject(locale)` function next to it.
2. Its strings in `src/messages.ts`, under a new key, in `en` and `es`.
3. An entry in the `templates` table in `src/index.ts`. `sendEmail` then
   accepts `template: "<name>"` with typed props.
4. A test in `src/__tests__` rendering it in both locales through the fake
   transport, asserting the subject and that every link is in the text body.

## Transports

| `RESEND_API_KEY` | Transport | Behaviour |
| --- | --- | --- |
| set | `resend` | delivers; a Resend error rejects the send |
| unset | `console` | prints recipient, subject and the plain-text body (links included) to the server log — how a local sign-up gets verified |
| — | `fake` | tests only; records payloads |

Production refuses to boot without the key (`packages/env`).
