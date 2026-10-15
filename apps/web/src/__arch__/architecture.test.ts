import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationChanges, RESTRICTIONS, RULES, type SourceFile, type Violation } from "./rules";

/**
 * The architecture test. Two halves, deliberately in one file:
 *
 *  1. every rule runs over the real repository, and
 *  2. every rule runs over inline snippets that MUST be flagged (and ones that
 *     must not), so a rule that stops matching goes red instead of quietly
 *     enforcing nothing. A rule without a self-test fails the suite.
 *
 * Nothing here depends on the example feature existing.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".source",
  ".claude",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  "__arch__",
  "scripts",
]);
const READ = /(?:\.(?:[cm]?[jt]sx?|json|md)|\.env\.example)$/;

function collect(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) collect(full, out);
    else if (READ.test(entry) && info.size < 2_000_000) {
      out.push({
        path: relative(REPO_ROOT, full).split(sep).join("/"),
        text: readFileSync(full, "utf8"),
      });
    }
  }
  return out;
}

const f = (path: string, text: string): SourceFile => ({ path, text });

function report(violations: Violation[]): string {
  return violations.map((v) => `${v.file}:${v.line}  [${v.rule}] ${v.message}`).join("\n");
}

// ------------------------------------------------------------ 1. the repository

describe("architecture rules hold across the repository", () => {
  const files = collect(REPO_ROOT);

  it("found the repository", () => {
    expect(files.some((file) => file.path === "AGENTS.md")).toBe(true);
    expect(files.some((file) => file.path.startsWith("apps/web/src/"))).toBe(true);
  });

  for (const rule of RULES) {
    it(`${rule.id}: ${rule.description}`, () => {
      expect(report(rule.check(files))).toBe("");
    });
  }

  it("migrations-immutable: no applied migration is edited or deleted", () => {
    const changes = migrationChangesAgainstBase();
    if (changes === null) {
      console.warn("migrations-immutable skipped: no origin/main (or main) to compare against.");
      return;
    }
    expect(report(migrationChanges(changes))).toBe("");
  });
});

/** `git diff --name-status` of the migrations folder against the merge base, or null. */
function migrationChangesAgainstBase(): Array<{ status: string; path: string }> | null {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  for (const base of ["origin/main", "main"]) {
    try {
      const mergeBase = git("merge-base", "HEAD", base).trim();
      return git("diff", "--name-status", mergeBase, "--", "packages/db/migrations")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [status = "", path = ""] = line.split("\t");
          return { status, path };
        });
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// ------------------------------------------------------------- 2. the self-tests

interface SelfTest {
  /** Each scenario is a whole (tiny) repository that the rule must flag. */
  bad: SourceFile[][];
  /** Each scenario is one the rule must leave alone. */
  good: SourceFile[][];
}

const ARCH_TABLE = f(
  "ARCHITECTURE.md",
  [
    "### Dependency rules",
    "```",
    "apps/web          →  packages/db, auth, config",
    "packages/auth     →  packages/db, config",
    "packages/db       →  packages/config",
    "packages/ui       →  packages/config",
    "```",
  ].join("\n"),
);
const pkg = (dir: string, deps: string[]) =>
  f(
    `${dir}/package.json`,
    JSON.stringify({
      dependencies: Object.fromEntries(deps.map((d) => [`@repo/${d}`, "workspace:*"])),
    }),
  );

const ACTION_OK = `"use server";
import { requireSession } from "@repo/auth";
export async function save() {
  const session = await requireSession();
  return session;
}
`;

const SELF_TESTS: Record<string, SelfTest> = {
  "no-cross-feature-imports": {
    bad: [
      [f("apps/web/src/features/a/x.ts", 'import { q } from "@/features/b/queries";')],
      [f("apps/web/src/features/a/x.ts", 'import { q } from "../b/schema";')],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/x.ts",
          'import { p } from "@/lib/form";\nimport { s } from "./schema";\nimport { t } from "../a/schema";',
        ),
      ],
      [f("apps/web/src/app/p/page.tsx", 'import { q } from "@/features/b/queries";')],
      [
        f(
          "apps/web/src/features/a/x.ts",
          '// arch-allow(no-cross-feature-imports): documented exception for the test\nimport { q } from "@/features/b/queries";',
        ),
      ],
    ],
  },
  "packages-never-import-apps": {
    bad: [
      [f("packages/ui/src/x.ts", 'import { a } from "../../../apps/web/src/y";')],
      [f("packages/auth/src/x.ts", 'import { a } from "@repo/web";')],
    ],
    good: [[f("packages/ui/src/x.ts", 'import { a } from "@repo/env";\nimport { b } from "./y";')]],
  },
  "no-relative-escape": {
    bad: [[f("packages/ui/src/a/b.ts", 'import { x } from "../../../auth/src/x";')]],
    good: [
      [
        f(
          "packages/ui/src/a/b.ts",
          'import { x } from "../c";\nimport { y } from "../../utils/cx";',
        ),
      ],
    ],
  },
  "package-graph": {
    bad: [
      [ARCH_TABLE, pkg("packages/ui", ["db"])],
      [ARCH_TABLE, pkg("packages/auth", ["db"]), pkg("packages/db", ["auth"])].map((file) =>
        file.path === "ARCHITECTURE.md"
          ? f(
              file.path,
              file.text.replace(
                "packages/db       →  packages/config",
                "packages/db       →  packages/auth",
              ),
            )
          : file,
      ),
      [ARCH_TABLE, pkg("packages/mystery", [])],
      [ARCH_TABLE, f("packages/ui/src/x.ts", 'import { q } from "@repo/db";')],
      [pkg("packages/ui", [])],
    ],
    good: [
      [
        ARCH_TABLE,
        pkg("packages/ui", ["config"]),
        pkg("apps/web", ["db", "auth"]),
        f("packages/auth/src/x.ts", 'import { q } from "@repo/db/testing";'),
      ],
    ],
  },
  "queries-server-only": {
    bad: [
      [
        f(
          "apps/web/src/features/a/queries.ts",
          'import { db } from "@repo/db";\nexport const q = 1;',
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/queries.ts",
          'import "server-only";\nimport { db } from "@repo/db";',
        ),
      ],
    ],
  },
  "actions-contract": {
    bad: [
      [f("apps/web/src/features/a/actions.ts", ACTION_OK.replace('"use server";\n', ""))],
      [f("apps/web/src/features/a/actions.ts", `${ACTION_OK}export const helper = () => 1;`)],
      [f("apps/web/src/features/a/actions.ts", `${ACTION_OK}export function sync() { return 1; }`)],
      [
        f(
          "apps/web/src/features/a/actions.ts",
          `${ACTION_OK}export async function noAuth() {\n  const x = 1;\n  await requireSession();\n  return x;\n}`,
        ),
      ],
    ],
    good: [
      [f("apps/web/src/features/a/actions.ts", `${ACTION_OK}export type S = { ok: true };`)],
      [
        f(
          "apps/web/src/features/a/actions.ts",
          `${ACTION_OK}// arch-allow(public-action): sign-in runs before any session exists\nexport async function signIn() {\n  return 1;\n}`,
        ),
      ],
      [
        f(
          "apps/web/src/features/a/actions.ts",
          '"use server";\nimport { requireAdmin } from "@repo/auth";\nexport async function a() {\n  await requireAdmin();\n}',
        ),
      ],
    ],
  },
  "route-handler-writes": {
    bad: [
      [
        f(
          "apps/web/src/app/[locale]/x/route.ts",
          "export async function POST() { return new Response(); }",
        ),
      ],
      [
        f(
          "apps/web/src/app/api/things/route.ts",
          "export const DELETE = async () => new Response();",
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/app/api/payments/webhook/route.ts",
          "export async function POST() { return new Response(); }",
        ),
      ],
      [
        f(
          "apps/web/src/app/api/jobs/x/route.ts",
          "export async function POST() { return new Response(); }",
        ),
      ],
      [
        f(
          "apps/web/src/app/[locale]/x/route.ts",
          "export async function GET() { return new Response(); }",
        ),
      ],
    ],
  },
  "no-path-literals": {
    bad: [
      [f("apps/web/src/features/a/x.ts", 'redirect("/dashboard");')],
      [f("apps/web/src/features/a/x.tsx", 'const a = <Link href="/settings">x</Link>;')],
      [f("apps/web/src/features/a/x.tsx", "const a = <a href={`/p/$" + "{id}`}>x</a>;")],
      [f("apps/web/src/features/a/x.ts", "router.push(`/p/$" + "{id}`);")],
      [f("apps/web/src/features/a/x.ts", 'const p = localizedPath(locale, "/sign-in");')],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/x.ts",
          "redirect(DASHBOARD_PATH);\nrouter.push(settingsPath(id));",
        ),
      ],
      [
        f(
          "apps/web/src/features/a/x.tsx",
          'const a = <a href="https://example.com">x</a>;\nconst b = <a href="#top">y</a>;',
        ),
      ],
      [f("apps/web/src/lib/routes.ts", 'export const A = "/a";\nredirect("/a");')],
      [f("apps/web/src/features/a/__tests__/x.test.ts", 'redirect("/a");')],
    ],
  },
  "cache-tags-only": {
    bad: [
      [f("apps/web/src/features/a/x.ts", 'updateTag("files:u1");')],
      [f("apps/web/src/features/a/x.ts", "revalidateTag(tag, 'max');")],
      [f("apps/web/src/features/a/x.ts", "cacheTag(`files:$" + "{id}`);")],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/x.ts",
          "updateTag(cacheTags.files(id));\ncacheTag(cacheTags.file(id));\nrevalidateTag(cacheTags.order(id), 'max');",
        ),
      ],
    ],
  },
  "use-cache-purity": {
    bad: [
      [
        f(
          "apps/web/src/features/a/q.ts",
          'export async function q() {\n  "use cache";\n  const c = await cookies();\n}',
        ),
      ],
      [
        f(
          "apps/web/src/features/a/q.ts",
          '"use cache";\nexport async function q() {\n  const s = await requireSession();\n}',
        ),
      ],
      [
        f(
          "apps/web/src/features/a/q.ts",
          'export const q = async (id: string) => {\n  "use cache";\n  return getSession(id);\n};',
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/q.ts",
          'export async function q(userId: string) {\n  "use cache";\n  cacheTag(cacheTags.files(userId));\n}',
        ),
      ],
      [
        f(
          "apps/web/src/features/a/q.ts",
          "export async function page() {\n  const s = await requireSession();\n  return s;\n}",
        ),
      ],
    ],
  },
  "no-raw-sql-in-features": {
    bad: [
      [
        f(
          "apps/web/src/features/a/q.ts",
          "const r = await db.select({ n: sql`count(*)` }).from(t);",
        ),
      ],
      [f("apps/web/src/features/a/q.ts", 'await db.execute("select 1");')],
      [f("apps/web/src/features/a/q.ts", 'await client.unsafe("select 1");')],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/q.ts",
          "await db.select({ id: t.id }).from(t).where(eq(t.id, id));",
        ),
      ],
      [f("packages/db/src/x.ts", "const r = sql`select 1`;")],
      [f("apps/web/src/features/a/__tests__/q.test.ts", "const r = sql`select 1`;")],
    ],
  },
  "client-no-db-barrel": {
    bad: [
      [f("apps/web/src/features/a/c.tsx", '"use client";\nimport { things } from "@repo/db";')],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/c.tsx",
          '"use client";\nimport { selectX } from "@repo/db/schema";\nimport type { Y } from "@repo/db";',
        ),
      ],
      [f("apps/web/src/features/a/q.ts", 'import { db } from "@repo/db";')],
    ],
  },
  "no-session-in-try": {
    bad: [
      [
        f(
          "apps/web/src/features/a/x.ts",
          "async function a() {\n  try {\n    await requireSession();\n  } catch {}\n}",
        ),
      ],
      [
        f(
          "apps/web/src/features/a/x.ts",
          "async function a() {\n  try {\n    const s = await requireAdmin();\n    do(s);\n  } catch {}\n}",
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/x.ts",
          "async function a() {\n  const s = await requireSession();\n  try {\n    do(s);\n  } catch {}\n}",
        ),
      ],
    ],
  },
  "edge-env": {
    bad: [
      [
        f("apps/web/src/middleware.ts", 'import { x } from "@/lib/x";'),
        f("apps/web/src/lib/x.ts", 'import { env } from "@repo/env";'),
      ],
      [f("apps/web/src/middleware.ts", 'import { hasSessionCookie } from "@repo/auth";')],
    ],
    good: [
      [
        f(
          "apps/web/src/middleware.ts",
          'import { x } from "@/lib/x";\nimport { y } from "@repo/auth/edge";',
        ),
        f("apps/web/src/lib/x.ts", 'import { env } from "@repo/env/edge";'),
      ],
      [
        f("apps/web/src/middleware.ts", 'import { x } from "@/lib/x";'),
        f("apps/web/src/lib/x.ts", "export const x = 1;"),
        f("apps/web/src/lib/server-only.ts", 'import { env } from "@repo/env";'),
      ],
    ],
  },
  "ts-expect-error-reason": {
    bad: [
      [f("apps/web/src/a.ts", "// @ts-expect-error\nfoo();")],
      [f("apps/web/src/a.ts", "// @ts-ignore: whatever it is here")],
      [f("apps/web/src/a.ts", "// @ts-expect-error: bad")],
    ],
    good: [
      [f("apps/web/src/a.ts", "// @ts-expect-error: third-party types are wrong here\nfoo();")],
      [f("apps/web/src/a.ts", "const note = 'mentions @ts-expect-error in a string';")],
    ],
  },
  "csp-no-strict-dynamic": {
    bad: [
      [
        f(
          "apps/web/src/lib/security-headers.ts",
          "export const csp = \"script-src 'self' 'strict-dynamic'\";",
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/lib/security-headers.ts",
          "// 'strict-dynamic' would break prerendered pages\nexport const csp = \"script-src 'self'\";",
        ),
      ],
    ],
  },
  "db-tests-use-transaction": {
    bad: [
      [
        f(
          "apps/web/src/features/a/__tests__/x.test.ts",
          'import { db } from "@repo/db";\nit("x", () => db);',
        ),
      ],
    ],
    good: [
      [
        f(
          "apps/web/src/features/a/__tests__/x.test.ts",
          'import { db } from "@repo/db";\nimport { setupTestTransaction } from "@repo/db/testing";\nsetupTestTransaction();',
        ),
      ],
      [f("apps/web/src/features/a/__tests__/x.test.ts", 'import type { Row } from "@repo/db";')],
      [
        f(
          "apps/web/src/features/a/__tests__/x.test.ts",
          'vi.mock("@repo/db", () => ({}));\nimport { db } from "@repo/db";',
        ),
      ],
    ],
  },
  "env-parity": {
    bad: [
      [
        f(
          "packages/env/src/index.ts",
          "createEnv({\n  server: {\n    ALPHA: z.string(),\n    BETA: z.string(),\n  },\n});",
        ),
        f(".env.example", "ALPHA=1\n"),
      ],
      [
        f(
          "packages/env/src/index.ts",
          "createEnv({\n  server: {\n    ALPHA: z.string(),\n  },\n});",
        ),
        f(".env.example", "ALPHA=1\nGAMMA=2\n"),
      ],
    ],
    good: [
      [
        f(
          "packages/env/src/index.ts",
          "createEnv({\n  server: {\n    ALPHA: z.string(),\n    BETA: z.string().optional(),\n    VERCEL_URL: z.string().optional(),\n  },\n});",
        ),
        f(".env.example", "ALPHA=1\n# BETA=2\n"),
      ],
    ],
  },
  "messages-parity": {
    bad: [
      [
        f("apps/web/messages/en.json", '{"a":{"b":"x","c":"y"}}'),
        f("apps/web/messages/es.json", '{"a":{"b":"x"}}'),
      ],
      [
        f("apps/web/messages/en.json", '{"a":"x"}'),
        f("apps/web/messages/es.json", '{"a":"x","z":"y"}'),
      ],
    ],
    good: [
      [
        f("apps/web/messages/en.json", '{"a":{"b":"x"}}'),
        f("apps/web/messages/es.json", '{"a":{"b":"equis"}}'),
      ],
    ],
  },
  "arch-allow-reason": {
    bad: [
      [f("apps/web/src/a.ts", "// arch-allow(no-path-literals)\nredirect('/a');")],
      [f("apps/web/src/a.ts", "// arch-allow(no-path-literals): x\n")],
    ],
    good: [
      [f("apps/web/src/a.ts", "// arch-allow(no-path-literals): external URL, not an app route\n")],
    ],
  },
};

/** One bad/good pair per entry in the restricted-imports table. */
const RESTRICTED_SELF_TESTS: Record<
  string,
  { badPath: string; goodPath: string; code: string; goodCode?: string }
> = {
  "supabase-js-only-in-storage": {
    badPath: "apps/web/src/features/a/q.ts",
    goodPath: "packages/storage/src/x.ts",
    code: 'import { createClient } from "@supabase/supabase-js";',
  },
  "postgres-driver-only-in-db": {
    badPath: "packages/auth/src/x.ts",
    goodPath: "packages/db/src/client.ts",
    code: 'import postgres from "postgres";',
  },
  "better-auth-only-in-auth": {
    badPath: "apps/web/src/lib/x.ts",
    goodPath: "packages/auth/src/auth.ts",
    code: 'import { betterAuth } from "better-auth/react";',
  },
  "resend-only-in-transport": {
    badPath: "packages/email/src/index.ts",
    goodPath: "packages/email/src/transports/resend.ts",
    code: 'import { Resend } from "resend";',
  },
  "hugeicons-only-in-icons": {
    badPath: "apps/web/src/lib/x.tsx",
    goodPath: "packages/ui/src/icons.tsx",
    code: 'import { Mail01Icon } from "@hugeicons/core-free-icons";',
  },
  "no-other-ui-kits": {
    badPath: "packages/ui/src/a.tsx",
    goodPath: "packages/ui/src/a.tsx",
    code: 'import * as D from "@radix-ui/react-dialog";',
    goodCode: 'import { Dialog } from "react-aria-components";',
  },
  "ui-framework-free": {
    badPath: "packages/ui/src/x.tsx",
    goodPath: "apps/web/src/x.tsx",
    code: 'import { useTranslations } from "next-intl";',
  },
  "web-localized-navigation": {
    badPath: "apps/web/src/features/a/x.tsx",
    goodPath: "apps/web/src/features/a/x.tsx",
    code: 'import { redirect } from "next/navigation";',
    goodCode: 'import { notFound } from "next/navigation";',
  },
};

describe("every rule fires on a deliberate violation (and not on the clean version)", () => {
  for (const rule of RULES) {
    const restricted = RESTRICTED_SELF_TESTS[rule.id];
    const cases: SelfTest | undefined = restricted
      ? {
          bad: [[f(restricted.badPath, restricted.code)]],
          good: [
            [f(restricted.goodPath, restricted.goodCode ?? restricted.code)],
            [
              f(
                restricted.badPath,
                `// arch-allow(${rule.id}): documented exception under test\n${restricted.code}`,
              ),
            ],
          ],
        }
      : SELF_TESTS[rule.id];

    it(`${rule.id} has a self-test`, () => {
      expect(cases, `add a SELF_TESTS entry for "${rule.id}"`).toBeDefined();
    });
    if (!cases) continue;

    cases.bad.forEach((scenario, index) => {
      it(`${rule.id} flags bad scenario ${index + 1}`, () => {
        const found = rule.check(scenario).filter((v) => v.rule === rule.id);
        expect(found.length, `expected a violation from ${rule.id}`).toBeGreaterThan(0);
      });
    });
    cases.good.forEach((scenario, index) => {
      it(`${rule.id} leaves good scenario ${index + 1} alone`, () => {
        expect(report(rule.check(scenario))).toBe("");
      });
    });
  }

  it("covers every entry of the restricted-imports table", () => {
    for (const restriction of RESTRICTIONS) {
      expect(RESTRICTED_SELF_TESTS[restriction.id], restriction.id).toBeDefined();
    }
  });

  it("new restricted-import self-tests are not orphaned", () => {
    const ids = new Set(RESTRICTIONS.map((r) => r.id));
    for (const id of Object.keys(RESTRICTED_SELF_TESTS)) expect(ids.has(id)).toBe(true);
  });

  it("migrations-immutable flags an edit and a delete, and allows additions", () => {
    expect(
      migrationChanges([{ status: "M", path: "packages/db/migrations/0001_x.sql" }]),
    ).toHaveLength(1);
    expect(
      migrationChanges([{ status: "D", path: "packages/db/migrations/0001_x.sql" }]),
    ).toHaveLength(1);
    expect(
      migrationChanges([{ status: "M", path: "packages/db/migrations/meta/0001_snapshot.json" }]),
    ).toHaveLength(1);
    expect(
      migrationChanges([{ status: "A", path: "packages/db/migrations/0009_new.sql" }]),
    ).toHaveLength(0);
    expect(
      migrationChanges([{ status: "M", path: "packages/db/migrations/meta/_journal.json" }]),
    ).toHaveLength(0);
  });
});
