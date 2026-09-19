/**
 * What every Server Action returns.
 *
 * Actions return, they do not throw, for expected failures — a wrong password,
 * a rejected field, a missing record. Throwing is reserved for genuine bugs,
 * which the error boundary and Sentry pick up. A discriminated union makes the
 * caller handle both halves.
 *
 * Errors are carried as keys, never as sentences. The action runs on the
 * server, where the user's locale is a request concern; the component that
 * renders the message is where the translation belongs.
 */
export type ActionState<TData = undefined, TErrorCode extends string = string> =
  | { ok: true; data: TData }
  | {
      ok: false;
      /** Form-level failure, e.g. bad credentials or a rate limit. */
      code?: TErrorCode;
      /** Field-level failures, keyed by field name. Values are message keys. */
      errors?: Record<string, string[] | undefined>;
    };
