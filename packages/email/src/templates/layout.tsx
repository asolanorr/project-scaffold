import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
// Explicit `React` import, despite `tsconfig.json` setting the automatic
// JSX runtime: `tsx` (the CLI that runs packages/auth's seed script) only
// applies a package's own "jsx" compiler option to files inside that
// package's own tsconfig — a template rendered from outside packages/email
// (anywhere that isn't Next, which transforms JSX with its own bundler
// regardless of this) gets the classic transform instead, which compiles
// `<Layout>` to `React.createElement(Layout, ...)` and needs `React` in
// scope to do it. Confirmed empirically: removing this reproduces
// `ReferenceError: React is not defined` when `pnpm db:seed` sends the
// verification email. Every template file that returns JSX needs it, not
// just this one — each is its own module with its own local scope.
// biome-ignore lint/correctness/noUnusedImports: used by the classic JSX transform's React.createElement calls, invisible to static analysis
import React from "react";
import type { EmailLocale, EmailMessages } from "../messages";

// Email clients ignore stylesheets; every style is inline, and the palette is
// a handful of literal values that match the app's tokens closely enough. The
// design system's Tailwind classes cannot be used here.
const styles = {
  body: { backgroundColor: "#f5f5f5", fontFamily: "Inter, -apple-system, Segoe UI, sans-serif" },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    margin: "40px auto",
    padding: "32px",
    maxWidth: 520,
  },
  text: { color: "#535862", fontSize: 16, lineHeight: "24px", margin: "0 0 16px" },
  muted: { color: "#717680", fontSize: 14, lineHeight: "20px", margin: "0 0 8px" },
  button: {
    backgroundColor: "#7f56d9",
    borderRadius: 8,
    color: "#ffffff",
    display: "inline-block",
    fontSize: 16,
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  link: { color: "#6941c6", fontSize: 14, wordBreak: "break-all" as const },
  hr: { borderColor: "#e9eaeb", margin: "24px 0" },
} as const;

export type LayoutProps = {
  locale: EmailLocale;
  common: EmailMessages["common"];
  preview: string;
  name: string;
  children: ReactNode;
  /** A call to action, rendered as a button with the raw link underneath. */
  action?: { label: string; url: string };
  /** The "you can ignore this" line — off for notifications the user did not request. */
  showIgnore?: boolean;
};

export function Layout({
  locale,
  common,
  preview,
  name,
  children,
  action,
  showIgnore = true,
}: LayoutProps) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.text}>{common.greeting(name)}</Text>
          {children}
          {action && (
            <Section style={{ margin: "24px 0" }}>
              <Button href={action.url} style={styles.button}>
                {action.label}
              </Button>
              <Text style={{ ...styles.muted, marginTop: 16 }}>{common.buttonFallback}</Text>
              <Link href={action.url} style={styles.link}>
                {action.url}
              </Link>
            </Section>
          )}
          {showIgnore && <Text style={styles.muted}>{common.ignore}</Text>}
          <Hr style={styles.hr} />
          <Text style={styles.muted}>{common.signature}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const textStyle = styles.text;
export const mutedStyle = styles.muted;
