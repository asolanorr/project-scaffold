import { describe, expect, it } from "vitest";
import { applySecurityHeaders, buildContentSecurityPolicy, createNonce } from "../security-headers";

const policy = () => buildContentSecurityPolicy("TEST_NONCE");

const directive = (name: string) =>
  policy()
    .split("; ")
    .find((part) => part.startsWith(`${name} `));

describe("createNonce", () => {
  it("produces a different value each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
  });

  // A CSP source expression is parsed by splitting on spaces and semicolons, so
  // either would end the directive early and silently widen the policy.
  it("contains no character that would break the header", () => {
    for (let i = 0; i < 50; i++) {
      expect(createNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });
});

describe("buildContentSecurityPolicy", () => {
  it("carries the nonce in script-src", () => {
    expect(directive("script-src")).toContain("'nonce-TEST_NONCE'");
  });

  // The deliberate deviation from ARCHITECTURE.md §10. strict-dynamic makes the
  // browser ignore 'self', and Next can only nonce script tags on a route it
  // renders per request — so with cacheComponents prerendering the shells, it
  // would block every script on a prerendered page and the app would not boot.
  it("does not use strict-dynamic", () => {
    expect(policy()).not.toContain("strict-dynamic");
  });

  // Which is what makes the prerendered, un-nonced script tags load.
  it("allows same-origin scripts", () => {
    expect(directive("script-src")).toContain("'self'");
  });

  // The actual XSS control: an injected inline script cannot guess the nonce.
  it("never allows inline scripts", () => {
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  it("does not allow eval outside development", () => {
    // NODE_ENV is "test" under vitest.
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });

  it.each([
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["default-src", "'self'"],
  ])("sets %s to %s", (name, value) => {
    expect(directive(name)).toBe(`${name} ${value}`);
  });
});

describe("applySecurityHeaders", () => {
  const headers = () => {
    const h = new Headers();
    applySecurityHeaders(h, policy());
    return h;
  };

  it("enforces the policy rather than reporting it", () => {
    expect(headers().get("content-security-policy")).toContain("script-src");
    expect(headers().get("content-security-policy-report-only")).toBeNull();
  });

  it.each([
    ["strict-transport-security", "max-age=63072000; includeSubDomains; preload"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
    ["x-frame-options", "DENY"],
  ])("sets %s", (name, value) => {
    expect(headers().get(name)).toBe(value);
  });
});
