import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../index";
import { createFakeTransport, setEmailTransport } from "../testing";
import { createConsoleTransport } from "../transports/console";

// Nothing here reaches Resend: a fake transport records what would have been
// sent, and the assertions are on that payload.
let fake = createFakeTransport();

beforeEach(() => {
  fake = createFakeTransport();
  setEmailTransport(fake);
});

afterEach(() => {
  setEmailTransport(undefined);
});

const url = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fdashboard";

describe("sendEmail", () => {
  it("renders the verification email in English with the link in both bodies", async () => {
    const payload = await sendEmail({
      to: "ada@example.com",
      template: "verifyEmail",
      props: { name: "Ada", url },
      locale: "en",
    });

    expect(fake.sent).toEqual([payload]);
    expect(payload).toMatchObject({
      to: "ada@example.com",
      from: "Scaffold <onboarding@resend.dev>",
      subject: "Verify your email address",
      template: "verifyEmail",
    });
    expect(payload.html).toContain('href="http://localhost:3000/api/auth/verify-email?token=abc');
    expect(payload.html).toContain("Hi Ada,");
    expect(payload.text).toContain(url);
    expect(payload.text).toContain("valid for 24 hours");
  });

  it("renders in Spanish when asked", async () => {
    const payload = await sendEmail({
      to: "ada@example.com",
      template: "passwordReset",
      props: { name: "Ada", url },
      locale: "es",
    });

    expect(payload.subject).toBe("Restablece tu contraseña");
    expect(payload.html).toContain("Hola Ada:");
    expect(payload.text).toContain("1 hora");
    expect(payload.html).toContain('lang="es"');
  });

  it("falls back to English for an unknown or missing locale", async () => {
    const first = await sendEmail({
      to: "a@example.com",
      template: "verifyEmail",
      props: { name: "A", url },
      locale: "fr",
    });
    const second = await sendEmail({
      to: "a@example.com",
      template: "verifyEmail",
      props: { name: "A", url },
      locale: null,
    });

    expect(first.subject).toBe("Verify your email address");
    expect(second.subject).toBe("Verify your email address");
  });

  it("formats the change time in the recipient's locale for the notification", async () => {
    const changedAt = new Date("2026-09-19T14:05:00Z");

    const en = await sendEmail({
      to: "a@example.com",
      template: "passwordChanged",
      props: { name: "A", changedAt, resetUrl: "http://localhost:3000/forgot-password" },
      locale: "en",
    });
    const es = await sendEmail({
      to: "a@example.com",
      template: "passwordChanged",
      props: { name: "A", changedAt, resetUrl: "http://localhost:3000/es/forgot-password" },
      locale: "es",
    });

    expect(en.text).toContain("September 19, 2026");
    expect(en.text).toContain("UTC");
    expect(es.text).toContain("19 de septiembre de 2026");
    expect(es.text).toContain("/es/forgot-password");
    // A notification the user did not ask for must not say "ignore this".
    expect(en.text).not.toContain("you can ignore this email");
  });

  it("escapes HTML in user-supplied values", async () => {
    const payload = await sendEmail({
      to: "a@example.com",
      template: "verifyEmail",
      props: { name: "<script>alert(1)</script>", url },
      locale: "en",
    });

    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });

  it("propagates a transport failure to a caller that awaits", async () => {
    setEmailTransport({
      name: "failing",
      send: async () => {
        throw new Error("provider down");
      },
    });

    await expect(
      sendEmail({
        to: "a@example.com",
        template: "verifyEmail",
        props: { name: "A", url },
        locale: "en",
      }),
    ).rejects.toThrow("provider down");
  });
});

describe("console transport", () => {
  it("prints the recipient, subject and plain-text body with the link", async () => {
    const log = vi.fn();
    setEmailTransport(createConsoleTransport(log));

    await sendEmail({
      to: "a@example.com",
      template: "verifyEmail",
      props: { name: "A", url },
      locale: "en",
    });

    const output = log.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("a@example.com");
    expect(output).toContain("Verify your email address");
    expect(output).toContain(url);
  });
});
