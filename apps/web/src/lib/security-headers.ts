import { edgeEnv } from "@repo/env/edge";

/** Request header the app reads the nonce back from, if it ever needs it. */
export const NONCE_HEADER = "x-nonce";

/**
 * Mint a per-request nonce.
 *
 * `crypto.randomUUID()` is available on the edge runtime; base64 keeps it to
 * the character set a CSP source expression allows.
 */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * React's shell-time marker, verbatim. Fizz writes it as an inline script at
 * the end of the prerendered shell (`shellTimeRuntimeScript` in
 * react-dom-server), and a prerendered shell has no request and so no nonce.
 * It only records when the shell painted, for Suspense reveal throttling;
 * blocked, React falls back to revealing on the next frame.
 *
 * Allowed by hash rather than by loosening script-src: a hash admits exactly
 * this text and nothing else. TODO: remove once Next stamps the nonce onto
 * prerendered inline scripts — https://github.com/vercel/next.js/issues/89754.
 * If a Next upgrade changes the script, the console shows a CSP violation
 * with the new hash; recompute with
 * `printf '%s' "$SCRIPT" | openssl dgst -sha256 -binary | openssl base64`.
 */
export const REACT_SHELL_TIME_SCRIPT = "requestAnimationFrame(function(){$RT=performance.now()});";
const REACT_SHELL_TIME_SCRIPT_HASH = "sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=";

/**
 * The Content-Security-Policy for a request.
 *
 * `script-src 'self' 'nonce-…' 'sha256-…'`, and deliberately NOT
 * `'strict-dynamic'`, which ARCHITECTURE.md §10 asks for. The two cannot both
 * be had here:
 *
 * `strict-dynamic` tells the browser to ignore every host-source expression,
 * `'self'` included, and to run only scripts carrying the nonce. Next stamps
 * the nonce onto its script tags by reading it from the request's CSP header —
 * which exists only when the HTML is rendered per request. With
 * cacheComponents on, the shell of every route is prerendered at build time,
 * when there is no request and no nonce, so the shell's script tags ship
 * without one. Under `strict-dynamic` that means every script on a prerendered
 * page is refused and the application does not boot at all.
 *
 * What the shell contains decides what the policy has to allow. Verified
 * against a build (`.next/server/app/<locale>/<route>.html`):
 *
 *   - external `<script src>` tags for the framework and route chunks —
 *     allowed by `'self'`;
 *   - one inline script, React's shell-time marker — allowed by its hash;
 *   - no inline flight data (`self.__next_f.push(...)`). Every route under
 *     `[locale]` has a request-time boundary in its layout (see
 *     `RequestBoundary` there), so every page is partially prerendered and
 *     its flight data streams at request time, where Next stamps the nonce
 *     on it. A fully static page would inline that data into the shell
 *     without a nonce, the browser would refuse it, and the page would never
 *     hydrate — silently, since forms still post without JavaScript.
 *
 * What stops XSS is unchanged: no `'unsafe-inline'`, and an attacker can
 * guess neither the nonce nor a hash of their own script. What is given up is
 * `strict-dynamic`'s real job, letting one trusted script pull in others
 * without a host allowlist. This app loads no third-party scripts, so there is
 * no allowlist to maintain and nothing to gain.
 *
 * `unsafe-eval` in development only — React's dev tooling and Turbopack's HMR
 * need it, and shipping it would defeat most of the policy.
 */
//#region policy
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = edgeEnv.NODE_ENV === "development";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' '${REACT_SHELL_TIME_SCRIPT_HASH}'${isDev ? " 'unsafe-eval'" : ""}`,
    // Next injects the critical CSS as an inline <style>, which no nonce is
    // applied to, so style-src has to allow inline. This is the one relaxation
    // in the policy; it is far less dangerous than script-src 'unsafe-inline'
    // because a style cannot execute.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    // The clickjacking defense. 'none' unless the app is meant to be embedded.
    "frame-ancestors 'none'",
    // Stops a <base> tag from re-pointing every relative URL in the document.
    "base-uri 'self'",
    // Server Actions post here; without this an injected form could target
    // somewhere else.
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
//#endregion

/**
 * Headers applied to every response, redirects included.
 *
 * The CSP is enforced, not report-only. A fresh project loads no third-party
 * scripts, so there is nothing for it to break; the first time it does break
 * will be when someone adds an analytics or chat widget, which is exactly the
 * moment to be asked. CSP_REPORT_ONLY exists for a project that must ship past
 * a stubborn embed, and is off by default.
 */
export function applySecurityHeaders(headers: Headers, csp: string): void {
  headers.set(
    edgeEnv.CSP_REPORT_ONLY ? "content-security-policy-report-only" : "content-security-policy",
    csp,
  );
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  // Redundant with frame-ancestors for modern browsers, kept for the ones that
  // only understand this.
  headers.set("x-frame-options", "DENY");
}
