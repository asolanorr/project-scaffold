import { memoryAdapter } from "@better-auth/memory-adapter";
import { createFakeTransport, type FakeTransport, setEmailTransport } from "@repo/email/testing";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `after()` from next/server has no request scope here. The mock records the
// deferred work so a test can (a) assert the response came back before the
// mail was sent and (b) flush the queue when it wants the mail.
const deferredTasks: Array<() => Promise<unknown>> = [];
vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => {
    deferredTasks.push(task);
  },
}));

const flushDeferred = async () => {
  const tasks = deferredTasks.splice(0);
  await Promise.all(tasks.map((task) => task()));
};

const {
  afterPasswordChange,
  beforePasswordReset,
  emailRateLimitRules,
  emailVerificationOptions,
  LOCALE_HEADER,
  passwordOptions,
  RESET_TOKEN_TTL_SECONDS,
  singleUseVerificationTokens,
  userLocaleField,
  VERIFICATION_TOKEN_TTL_SECONDS,
} = await import("../email-flows");

// The same pieces auth.ts uses, over an in-memory store, with the HTTP handler
// in front — the rate limiter and the hooks live in the router, and calling
// `auth.api.*` would skip both.
const baseURL = "http://localhost:3000";
function createAuth() {
  return betterAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
    }),
    secret: "test-secret-at-least-thirty-two-characters",
    baseURL,
    emailAndPassword: { enabled: true, ...passwordOptions, requireEmailVerification: true },
    emailVerification: emailVerificationOptions,
    user: { additionalFields: userLocaleField },
    rateLimit: { enabled: true, window: 60, max: 100, customRules: emailRateLimitRules },
    // Composed exactly as auth.ts composes them.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await singleUseVerificationTokens(ctx);
        await beforePasswordReset(ctx);
      }),
      after: createAuthMiddleware(async (ctx) => {
        await afterPasswordChange(ctx);
      }),
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth;
let fake: FakeTransport;

// The in-memory rate limiter is module-level and keyed by IP and path, so it
// outlives each test's auth instance. A fresh address per test keeps one
// test's sign-ups from tripping the next test's sign-up limit.
let counter = 0;
const ip = () => `203.0.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
let clientIp = ip();

async function post(path: string, body: unknown, extra: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseURL,
        "x-forwarded-for": clientIp,
        ...extra,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function get(path: string, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "GET",
      headers: { "x-forwarded-for": clientIp, ...headers },
      redirect: "manual",
    }),
  );
}

const linkIn = (text: string) => {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`no link in: ${text}`);
  return match[0];
};

const credentials = { email: "ada@example.com", password: "correct-horse-battery" };

async function signUp(locale = "en", extra: Record<string, string> = {}) {
  const response = await post(
    "/sign-up/email",
    { ...credentials, name: "Ada", locale, callbackURL: "/dashboard" },
    { [LOCALE_HEADER]: locale, ...extra },
  );
  expect(response.status).toBe(200);
  await flushDeferred();
  const mail = fake.last();
  if (!mail) throw new Error("no verification mail");
  return { response, mail, verifyUrl: linkIn(mail.text) };
}

async function verifiedUser() {
  const { verifyUrl } = await signUp();
  const verify = await get(verifyUrl.replace(baseURL, "").replace("/api/auth", ""));
  expect([200, 302]).toContain(verify.status);
  fake.clear();
  const signIn = await post("/sign-in/email", credentials);
  expect(signIn.status).toBe(200);
  return { cookie: signIn.headers.get("set-cookie") ?? "" };
}

beforeEach(() => {
  clientIp = ip();
  auth = createAuth();
  fake = createFakeTransport();
  setEmailTransport(fake);
  deferredTasks.length = 0;
});

afterEach(() => {
  setEmailTransport(undefined);
});

describe("sign-up", () => {
  it("stores the locale on the user and sends the verification mail in it", async () => {
    const { response, mail } = await signUp("es");

    const body = (await response.json()) as { user: { locale: string }; token: string | null };
    expect(body.user.locale).toBe("es");
    expect(mail).toMatchObject({
      to: credentials.email,
      template: "verifyEmail",
      subject: "Verifica tu dirección de correo",
    });
    expect(mail.html).toContain("Hola Ada:");
  });

  it("issues no session until the address is verified", async () => {
    const { response } = await signUp();

    const body = (await response.json()) as { token: string | null };
    expect(body.token).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();

    const signIn = await post("/sign-in/email", credentials);
    expect(signIn.status).toBe(403);
  });

  it("rejects a locale that mail cannot be written in", async () => {
    const response = await post("/sign-up/email", { ...credentials, name: "Ada", locale: "fr" });

    expect(response.status).toBe(400);
    expect(fake.sent).toHaveLength(0);
  });

  it("responds before the mail is sent", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake = createFakeTransport(() => held);
    setEmailTransport(fake);

    const response = await post("/sign-up/email", { ...credentials, name: "Ada" });

    // The response is here; the deferred send has been queued and not run.
    expect(response.status).toBe(200);
    expect(fake.sent).toHaveLength(0);
    expect(deferredTasks).toHaveLength(1);

    const flushing = flushDeferred();
    await fake.waitFor(1);
    release();
    await flushing;
  });
});

describe("verification token", () => {
  it("carries a 24 hour expiry", async () => {
    const { verifyUrl } = await signUp();
    const token = new URL(verifyUrl).searchParams.get("token") ?? "";
    const { exp, iat } = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
    ) as { exp: number; iat: number };

    expect(exp - iat).toBe(VERIFICATION_TOKEN_TTL_SECONDS);
  });

  it("verifies the address and signs the user in, once", async () => {
    const { verifyUrl } = await signUp();
    const path = verifyUrl.replace(`${baseURL}/api/auth`, "");

    const first = await get(path);
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("/dashboard");
    expect(first.headers.get("set-cookie")).toContain("session_token");

    // Refused, and sent back to where the link would have landed so the
    // page can explain; no session is issued.
    const second = await get(path);
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("/dashboard?error=invalid_token");
    expect(second.headers.get("set-cookie")).toBeNull();

    // Without a same-origin callback the refusal is a plain 400.
    const bare = await get(path.replace(/&callbackURL=[^&]*/, ""));
    expect(bare.status).toBe(400);
  });

  it("sends a fresh link on a sign-in attempt before verification, in the request locale", async () => {
    await signUp("en");
    fake.clear();

    const response = await post("/sign-in/email", credentials, { [LOCALE_HEADER]: "es" });
    await flushDeferred();

    expect(response.status).toBe(403);
    expect(fake.last()?.subject).toBe("Verifica tu dirección de correo");
  });
});

describe("password reset", () => {
  it("sends the link in the request locale and the token lasts an hour", async () => {
    await verifiedUser();

    const response = await post(
      "/request-password-reset",
      { email: credentials.email, redirectTo: "/es/reset-password" },
      { [LOCALE_HEADER]: "es" },
    );
    await flushDeferred();

    expect(response.status).toBe(200);
    const mail = fake.last();
    expect(mail).toMatchObject({ template: "passwordReset", subject: "Restablece tu contraseña" });

    const token =
      linkIn(mail?.text ?? "")
        .split("/reset-password/")[1]
        ?.split("?")[0] ?? "";
    const stored = await (await auth.$context).internalAdapter.findVerificationValue(
      `reset-password:${token}`,
    );
    expect(stored).not.toBeNull();
    const ttl = (stored?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(RESET_TOKEN_TTL_SECONDS * 1000 - 5000);
    expect(ttl).toBeLessThanOrEqual(RESET_TOKEN_TTL_SECONDS * 1000);
  });

  it("answers the same for an unknown address and sends nothing", async () => {
    const response = await post("/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });
    await flushDeferred();

    expect(response.status).toBe(200);
    expect(fake.sent).toHaveLength(0);
  });

  async function requestResetToken(): Promise<string> {
    fake.clear();
    await post("/request-password-reset", {
      email: credentials.email,
      redirectTo: "/reset-password",
    });
    await flushDeferred();
    return (
      linkIn(fake.last()?.text ?? "")
        .split("/reset-password/")[1]
        ?.split("?")[0] ?? ""
    );
  }

  it("resets once with a token, then refuses it", async () => {
    await verifiedUser();
    const token = await requestResetToken();

    const first = await post("/reset-password", { token, newPassword: "new-horse-battery-1" });
    expect(first.status).toBe(200);

    const second = await post("/reset-password", { token, newPassword: "new-horse-battery-2" });
    expect(second.status).toBe(400);

    const signIn = await post("/sign-in/email", {
      ...credentials,
      password: "new-horse-battery-1",
    });
    expect(signIn.status).toBe(200);
  });

  it("invalidates every other outstanding reset token when one is used", async () => {
    await verifiedUser();
    const older = await requestResetToken();
    const newer = await requestResetToken();

    expect(
      (await post("/reset-password", { token: newer, newPassword: "new-horse-battery-1" })).status,
    ).toBe(200);
    expect(
      (await post("/reset-password", { token: older, newPassword: "new-horse-battery-2" })).status,
    ).toBe(400);
  });

  it("notifies the owner in the account's locale, not the request's", async () => {
    // A Spanish account; the reset comes from an English page.
    await signUp("es");
    const verify = await get(linkIn(fake.last()?.text ?? "").replace(`${baseURL}/api/auth`, ""));
    expect(verify.status).toBe(302);
    const token = await requestResetToken();
    fake.clear();

    const response = await post(
      "/reset-password",
      { token, newPassword: "new-horse-battery-1" },
      { [LOCALE_HEADER]: "en" },
    );
    await flushDeferred();

    expect(response.status).toBe(200);
    expect(fake.last()).toMatchObject({
      template: "passwordChanged",
      to: credentials.email,
      subject: "Tu contraseña fue cambiada",
    });
    expect(fake.last()?.text).toContain("/es/forgot-password");
  });

  it("revokes existing sessions on reset", async () => {
    const { cookie } = await verifiedUser();
    const token = await requestResetToken();
    await post("/reset-password", { token, newPassword: "new-horse-battery-1" });

    const session = await get("/get-session", { cookie });
    expect(await session.json()).toBeNull();
  });
});

describe("password change", () => {
  it("invalidates outstanding reset tokens and notifies the owner", async () => {
    const { cookie } = await verifiedUser();
    fake.clear();
    await post("/request-password-reset", {
      email: credentials.email,
      redirectTo: "/reset-password",
    });
    await flushDeferred();
    const token =
      linkIn(fake.last()?.text ?? "")
        .split("/reset-password/")[1]
        ?.split("?")[0] ?? "";
    fake.clear();

    const change = await post(
      "/change-password",
      { currentPassword: credentials.password, newPassword: "new-horse-battery-1" },
      { cookie },
    );
    await flushDeferred();

    expect(change.status).toBe(200);
    expect(fake.last()?.template).toBe("passwordChanged");
    expect(
      (await post("/reset-password", { token, newPassword: "x-horse-battery-2" })).status,
    ).toBe(400);
  });
});

describe("rate limits", () => {
  it("limits resend-verification per address separately from the general limit", async () => {
    await signUp();
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < emailRateLimitRules["/send-verification-email"].max + 1; i++) {
      const response = await post(
        "/send-verification-email",
        { email: credentials.email, callbackURL: "/dashboard" },
        { "x-forwarded-for": client },
      );
      statuses.push(response.status);
    }

    expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);

    // The general limit has not been touched by this: a sign-in from the same
    // address still goes through.
    const signIn = await post("/sign-in/email", credentials, { "x-forwarded-for": client });
    expect(signIn.status).not.toBe(429);
  });

  it("limits reset requests the same way", async () => {
    const client = ip();
    const statuses: number[] = [];
    for (let i = 0; i < emailRateLimitRules["/request-password-reset"].max + 1; i++) {
      const response = await post(
        "/request-password-reset",
        { email: "nobody@example.com", redirectTo: "/reset-password" },
        { "x-forwarded-for": client },
      );
      statuses.push(response.status);
    }

    expect(statuses.at(-1)).toBe(429);
  });
});
