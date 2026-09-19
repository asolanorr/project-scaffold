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
 * The Content-Security-Policy for a request.
 *
 * `script-src 'self' 'nonce-…'`, and deliberately NOT `'strict-dynamic'`,
 * which ARCHITECTURE.md §10 asks for. The two cannot both be had here:
 *
 * `strict-dynamic` tells the browser to ignore every host-source expression,
 * `'self'` included, and to run only scripts carrying the nonce. Next stamps
 * the nonce onto its script tags by reading it from the request's CSP header —
 * which exists only when the HTML is rendered per request. With
 * cacheComponents on, the shells of these routes are prerendered at build time,
 * when there is no request and no nonce, so their script tags ship without one.
 * Under `strict-dynamic` that means every script on a prerendered page is
 * refused and the application does not boot at all. This was verified against a
 * build: a fully dynamic route gets nonced tags, a prerendered or partially
 * prerendered one does not.
 *
 * Without `strict-dynamic`, `'self'` and the nonce are alternatives rather than
 * one overriding the other: the prerendered tags are allowed by `'self'`, the
 * dynamic ones by either, and — the part that actually stops XSS — an injected
 * inline script is still refused, because there is no `'unsafe-inline'` and an
 * attacker cannot guess the nonce. What is given up is `strict-dynamic`'s real
 * job, which is letting one trusted script pull in others without maintaining a
 * host allowlist. This app loads no third-party scripts, so there is no
 * allowlist to maintain and nothing to gain.
 *
 * Getting `strict-dynamic` back means rendering every page dynamically
 * (`export const instant = false` throughout), which is the opposite of what
 * enabling cacheComponents was for.
 *
 * `unsafe-eval` in development only — React's dev tooling and Turbopack's HMR
 * need it, and shipping it would defeat most of the policy.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = edgeEnv.NODE_ENV === "development";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
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
