/**
 * Architecture rules, as pure functions over `{ path, text }` pairs.
 *
 * `architecture.test.ts` runs every rule over the real repository and, for every
 * rule, over small inline snippets that MUST be flagged (and ones that must not),
 * so a rule that silently stops matching turns the build red instead of quietly
 * enforcing nothing.
 *
 * Nothing here knows about a particular feature: rules are written against
 * folders (`features/*`), file names (`actions.ts`) and package names, so they
 * hold whether or not the example feature was removed by `project:init`.
 *
 * Escape hatch, always with a reason:  // arch-allow(<rule-id>): <why>
 * on the offending line or the comment lines directly above it.
 */
import * as ts from "typescript";

export interface SourceFile {
  /** Repo-relative, forward slashes. */
  path: string;
  text: string;
}

export interface Violation {
  rule: string;
  file: string;
  line: number;
  message: string;
}

export interface Rule {
  id: string;
  /** One line; shown in failures and mirrored in AGENTS.md. */
  description: string;
  check: (files: SourceFile[]) => Violation[];
}

// ---------------------------------------------------------------- AST helpers

const SCRIPT_EXT = /\.(?:[cm]?[jt]sx?)$/;
const isScript = (path: string) => SCRIPT_EXT.test(path);
const isTest = (path: string) => /(?:^|\/)__tests__\//.test(path) || /\.test\.[jt]sx?$/.test(path);

function parse(file: SourceFile): ts.SourceFile {
  const kind = /\.[jt]sx$/.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function visit(node: ts.Node, cb: (node: ts.Node) => void): void {
  cb(node);
  ts.forEachChild(node, (child) => visit(child, cb));
}

/** True when `arch-allow(rule): reason` sits on this line or the comment block above it. */
function allowed(file: SourceFile, line: number, rule: string): boolean {
  const lines = file.text.split("\n");
  const marker = new RegExp(`arch-allow\\(${rule}\\):\\s*\\S.{5,}`);
  for (let i = line - 1; i >= 0 && i >= line - 6; i--) {
    const text = lines[i] ?? "";
    if (marker.test(text)) return true;
    if (i < line - 1 && !/^\s*(?:\/\/|\/\*|\*)/.test(text)) break;
  }
  return false;
}

function violation(
  rule: string,
  file: SourceFile,
  sf: ts.SourceFile,
  node: ts.Node,
  message: string,
): Violation | null {
  const line = lineOf(sf, node);
  return allowed(file, line, rule) ? null : { rule, file: file.path, line, message };
}

interface ImportRef {
  specifier: string;
  node: ts.Node;
  typeOnly: boolean;
  /** Named bindings, when the form has them. */
  names: string[];
}

function importsOf(sf: ts.SourceFile): ImportRef[] {
  const out: ImportRef[] = [];
  visit(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names: string[] = [];
      if (clause?.name) names.push("default");
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          names.push((element.propertyName ?? element.name).text);
        }
      } else if (bindings) {
        names.push("*");
      }
      out.push({
        specifier: node.moduleSpecifier.text,
        node,
        typeOnly: !!clause?.isTypeOnly,
        names,
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({
        specifier: node.moduleSpecifier.text,
        node,
        typeOnly: node.isTypeOnly,
        names: [],
      });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0] as ts.Expression) &&
      ((node.expression.kind === ts.SyntaxKind.ImportKeyword && true) ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const arg = node.arguments[0] as ts.StringLiteralLike;
      out.push({ specifier: arg.text, node, typeOnly: false, names: [] });
    }
  });
  return out;
}

/** Leading directive prologue ("use server", "use client") of a statement list. */
function directives(statements: readonly ts.Statement[]): string[] {
  const found: string[] = [];
  for (const statement of statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      found.push(statement.expression.text);
    } else break;
  }
  return found;
}

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** Path of a relative import resolved against the importing file; null when not relative. */
function resolveRelative(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/** `@/x` -> apps/web/src/x, relative -> repo path, anything else -> null. */
function resolveLocal(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return `apps/web/src/${specifier.slice(2)}`;
  return resolveRelative(from, specifier);
}

/** The workspace folder a path belongs to: `apps/web`, `packages/ui`, or null. */
const workspaceOf = (path: string): string | null =>
  /^((?:apps|packages)\/[^/]+)\//.exec(path)?.[1] ?? null;

function perFile(
  files: SourceFile[],
  scope: (path: string) => boolean,
  inspect: (file: SourceFile, sf: ts.SourceFile) => Array<Violation | null>,
): Violation[] {
  const out: Violation[] = [];
  for (const file of files) {
    if (!isScript(file.path) || !scope(file.path)) continue;
    for (const found of inspect(file, parse(file))) if (found) out.push(found);
  }
  return out;
}

const WEB_SRC = /^apps\/web\/src\//;
const FEATURE_FILE = /^apps\/web\/src\/features\/([^/]+)\//;

// ----------------------------------------------------- restricted imports table

interface Restriction {
  id: string;
  modules: RegExp;
  /** Only these named imports are restricted; omit to restrict the module. */
  names?: string[];
  /** Paths where the import is legitimate. */
  allowIn: RegExp[];
  /** Limit the rule to these paths (default: everywhere). */
  scope?: RegExp;
  message: string;
}

export const RESTRICTIONS: Restriction[] = [
  {
    id: "supabase-js-only-in-storage",
    modules: /^@supabase\/supabase-js(?:\/.*)?$/,
    allowIn: [/^packages\/storage\//],
    message:
      "No @supabase/supabase-js for application queries; only packages/storage may use it. Queries go through @repo/db.",
  },
  {
    id: "postgres-driver-only-in-db",
    modules: /^(?:postgres|drizzle-orm\/postgres-js(?:\/.*)?)$/,
    allowIn: [/^packages\/db\//],
    message: "Database access goes through @repo/db; only packages/db opens a Postgres connection.",
  },
  {
    id: "better-auth-only-in-auth",
    modules: /^(?:better-auth(?:\/.*)?|@better-auth\/.*)$/,
    allowIn: [/^packages\/auth\//],
    message:
      "Import auth from @repo/auth, never better-auth directly; that indirection keeps auth replaceable.",
  },
  {
    id: "resend-only-in-transport",
    modules: /^resend$/,
    allowIn: [/^packages\/email\/src\/transports\/resend\.ts$/],
    message:
      "Mail leaves the app through sendEmail() from @repo/email; only the resend transport imports resend.",
  },
  {
    id: "hugeicons-only-in-icons",
    modules: /^@hugeicons\/.*$/,
    allowIn: [/^packages\/ui\/src\/icons\.tsx$/],
    message:
      "Import icons from @repo/ui/icons; packages/ui/src/icons.tsx is the only file that imports @hugeicons/*.",
  },
  {
    id: "no-other-ui-kits",
    modules: /^(?:@radix-ui\/.*|@headlessui\/.*|@untitledui\/icons(?:\/.*)?)$/,
    allowIn: [],
    message:
      "One primitive layer: React Aria through @repo/ui. No Radix, Headless UI, or @untitledui/icons (use @repo/ui/icons).",
  },
  {
    id: "ui-framework-free",
    modules: /^(?:next-intl(?:\/.*)?|next\/navigation|next\/link)$/,
    allowIn: [],
    scope: /^packages\/ui\//,
    message:
      "packages/ui is framework-neutral: no next-intl, next/navigation or next/link. Pass strings and callbacks in as props.",
  },
  {
    id: "web-localized-navigation",
    modules: /^next\/(?:link|navigation)$/,
    // Only the locale-sensitive names; notFound(), useParams() etc. are fine.
    names: ["default", "Link", "redirect", "permanentRedirect", "useRouter", "usePathname"],
    allowIn: [],
    scope: /^apps\/web\/src\//,
    message:
      "Import Link, redirect, useRouter and usePathname from @/i18n/navigation, or the locale prefix is dropped. (External URLs and the providers' router need // arch-allow(web-localized-navigation): <reason>.)",
  },
];

function restrictedImports(): Rule[] {
  return RESTRICTIONS.map((restriction) => ({
    id: restriction.id,
    description: restriction.message,
    check: (files) =>
      perFile(
        files,
        (path) =>
          (!restriction.scope || restriction.scope.test(path)) &&
          !restriction.allowIn.some((allow) => allow.test(path)),
        (file, sf) =>
          importsOf(sf)
            .filter((ref) => restriction.modules.test(ref.specifier))
            .filter(
              (ref) =>
                !restriction.names ||
                // `import "next/link"` or a namespace import has no names: restrict it too.
                ref.names.length === 0 ||
                ref.names.some((name) => restriction.names?.includes(name) || name === "*"),
            )
            .map((ref) => violation(restriction.id, file, sf, ref.node, restriction.message)),
      ),
  }));
}

// ---------------------------------------------------------------- the rules

const noCrossFeatureImports: Rule = {
  id: "no-cross-feature-imports",
  description: "features/a must not import features/b; shared code moves up to lib/ or a package.",
  check: (files) =>
    perFile(
      files,
      (path) => FEATURE_FILE.test(path),
      (file, sf) => {
        const own = FEATURE_FILE.exec(file.path)?.[1];
        return importsOf(sf).map((ref) => {
          const local = resolveLocal(file.path, ref.specifier);
          const target = local
            ? /^apps\/web\/src\/features\/([^/]+)(?:\/|$)/.exec(local)?.[1]
            : null;
          if (!target || target === own) return null;
          return violation(
            "no-cross-feature-imports",
            file,
            sf,
            ref.node,
            `features/${own} imports features/${target}. Features do not depend on each other; move the shared part to apps/web/src/lib or a package.`,
          );
        });
      },
    ),
};

const packagesNeverImportApps: Rule = {
  id: "packages-never-import-apps",
  description: "packages/* never import from apps/*.",
  check: (files) =>
    perFile(
      files,
      (path) => path.startsWith("packages/"),
      (file, sf) =>
        importsOf(sf).map((ref) => {
          const local = resolveRelative(file.path, ref.specifier);
          const intoApps =
            /^@repo\/(?:web|docs)(?:\/|$)/.test(ref.specifier) ||
            /^apps\//.test(ref.specifier) ||
            local?.startsWith("apps/");
          return intoApps
            ? violation(
                "packages-never-import-apps",
                file,
                sf,
                ref.node,
                `${file.path} imports ${ref.specifier}: packages never depend on apps.`,
              )
            : null;
        }),
    ),
};

const noRelativeEscape: Rule = {
  id: "no-relative-escape",
  description:
    "A relative import must not climb out of its own app or package; use the workspace alias.",
  check: (files) =>
    perFile(
      files,
      (path) => workspaceOf(path) !== null,
      (file, sf) =>
        importsOf(sf).map((ref) => {
          const target = resolveRelative(file.path, ref.specifier);
          if (target === null) return null;
          const home = workspaceOf(file.path);
          const away = workspaceOf(`${target}/`);
          return away !== home
            ? violation(
                "no-relative-escape",
                file,
                sf,
                ref.node,
                `${ref.specifier} climbs out of ${home}. Import workspace packages by alias (@repo/...).`,
              )
            : null;
        }),
    ),
};

/**
 * Parse the package table in ARCHITECTURE.md ("Dependency rules"), the single
 * source of truth for who may depend on whom.
 */
export function parseDependencyTable(markdown: string): Map<string, Set<string>> | null {
  const heading = markdown.indexOf("### Dependency rules");
  if (heading < 0) return null;
  const block = /```[^\n]*\n([\s\S]*?)```/.exec(markdown.slice(heading))?.[1];
  if (!block) return null;
  const table = new Map<string, Set<string>>();
  for (const line of block.split("\n")) {
    const match = /^\s*((?:apps|packages)\/[\w-]+)\s*→\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const allowed = new Set<string>();
    for (const item of (match[2] ?? "").split(",")) {
      const name = item.trim();
      if (!name || name.startsWith("(")) continue;
      allowed.add(name.replace(/^packages\//, ""));
    }
    table.set(match[1] ?? "", allowed);
  }
  return table;
}

const packageGraph: Rule = {
  id: "package-graph",
  description:
    "The workspace dependency graph matches the table in ARCHITECTURE.md (Dependency rules), has no cycles, and source imports stay inside it.",
  check: (files) => {
    const out: Violation[] = [];
    const architecture = files.find((file) => file.path === "ARCHITECTURE.md");
    const table = architecture ? parseDependencyTable(architecture.text) : null;
    if (!table) {
      return [
        {
          rule: "package-graph",
          file: "ARCHITECTURE.md",
          line: 1,
          message: 'Could not read the table under "### Dependency rules".',
        },
      ];
    }

    const declared = new Map<string, Set<string>>();
    for (const file of files) {
      const match = /^((?:apps|packages)\/[^/]+)\/package\.json$/.exec(file.path);
      if (!match) continue;
      const pkg = JSON.parse(file.text) as Record<string, Record<string, string> | undefined>;
      const internal = new Set<string>();
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const name of Object.keys(pkg[field] ?? {})) {
          if (name.startsWith("@repo/")) internal.add(name.slice("@repo/".length));
        }
      }
      declared.set(match[1] ?? "", internal);
      const allowedHere = table.get(match[1] ?? "");
      if (!allowedHere) {
        out.push({
          rule: "package-graph",
          file: file.path,
          line: 1,
          message: `${match[1]} is not in the Dependency rules table in ARCHITECTURE.md. Add a line for it.`,
        });
        continue;
      }
      for (const dep of internal) {
        if (dep === "web" || dep === "docs" || !allowedHere.has(dep)) {
          out.push({
            rule: "package-graph",
            file: file.path,
            line: 1,
            message: `${match[1]} depends on @repo/${dep}, which the Dependency rules table does not allow.`,
          });
        }
      }
    }

    // Cycles, over the declared graph (apps are never a dependency, so only packages).
    const visiting = new Set<string>();
    const done = new Set<string>();
    const dfs = (node: string, trail: string[]) => {
      if (done.has(node)) return;
      if (visiting.has(node)) {
        out.push({
          rule: "package-graph",
          file: "ARCHITECTURE.md",
          line: 1,
          message: `Circular dependency: ${[...trail, node].join(" -> ")}.`,
        });
        return;
      }
      visiting.add(node);
      for (const dep of declared.get(`packages/${node}`) ?? []) dfs(dep, [...trail, node]);
      visiting.delete(node);
      done.add(node);
    };
    for (const key of declared.keys()) dfs(key.replace(/^(?:apps|packages)\//, ""), []);

    // Source imports of @repo/* must stay inside the allowed set.
    out.push(
      ...perFile(
        files,
        (path) => workspaceOf(path) !== null,
        (file, sf) => {
          const home = workspaceOf(file.path) ?? "";
          const allowedHere = table.get(home);
          if (!allowedHere) return [];
          return importsOf(sf).map((ref) => {
            const dep = /^@repo\/([\w-]+)/.exec(ref.specifier)?.[1];
            if (!dep || `packages/${dep}` === home || allowedHere.has(dep)) return null;
            return violation(
              "package-graph",
              file,
              sf,
              ref.node,
              `${home} imports @repo/${dep}, which the Dependency rules table does not allow.`,
            );
          });
        },
      ),
    );
    return out;
  },
};

const serverOnlyQueries: Rule = {
  id: "queries-server-only",
  description: 'Every features/*/queries.ts starts with import "server-only".',
  check: (files) =>
    perFile(
      files,
      (path) => /^apps\/web\/src\/features\/[^/]+\/queries\.ts$/.test(path),
      (file, sf) => {
        const first = sf.statements.find((statement) => !ts.isExpressionStatement(statement));
        const ok =
          first !== undefined &&
          ts.isImportDeclaration(first) &&
          ts.isStringLiteral(first.moduleSpecifier) &&
          first.moduleSpecifier.text === "server-only";
        return [
          ok
            ? null
            : violation(
                "queries-server-only",
                file,
                sf,
                first ?? sf,
                'queries.ts must begin with `import "server-only";` so a client import fails at build time, not at runtime.',
              ),
        ];
      },
    ),
};

const SESSION_GUARDS = new Set(["requireSession", "requireAdmin"]);

function startsWithSessionGuard(fn: ts.FunctionDeclaration): boolean {
  const first = fn.body?.statements[0];
  if (!first) return false;
  let expression: ts.Node | undefined;
  if (ts.isExpressionStatement(first)) expression = first.expression;
  if (ts.isVariableStatement(first))
    expression = first.declarationList.declarations[0]?.initializer;
  while (
    expression &&
    (ts.isAwaitExpression(expression) || ts.isParenthesizedExpression(expression))
  ) {
    expression = expression.expression;
  }
  return (
    !!expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    SESSION_GUARDS.has(expression.expression.text)
  );
}

const actionsFiles: Rule = {
  id: "actions-contract",
  description:
    'features/*/actions.ts: starts with "use server"; exports only async functions (and types); each starts with requireSession()/requireAdmin() unless marked // arch-allow(public-action): <reason>.',
  check: (files) =>
    perFile(
      files,
      (path) => /^apps\/web\/src\/features\/[^/]+\/actions\.ts$/.test(path),
      (file, sf) => {
        const out: Array<Violation | null> = [];
        if (!directives(sf.statements).includes("use server")) {
          out.push(
            violation(
              "actions-contract",
              file,
              sf,
              sf.statements[0] ?? sf,
              'actions.ts must begin with "use server". Every export of such a file is a public HTTP endpoint.',
            ),
          );
        }
        for (const statement of sf.statements) {
          const exported = ts
            .getModifiers(statement as ts.HasModifiers)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
          if (
            !exported &&
            !ts.isExportDeclaration(statement) &&
            !ts.isExportAssignment(statement)
          ) {
            continue;
          }
          if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
            continue;
          if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
          const isAsyncFn =
            ts.isFunctionDeclaration(statement) &&
            !!ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
          if (!isAsyncFn) {
            out.push(
              violation(
                "actions-contract",
                file,
                sf,
                statement,
                'A "use server" file may export only async functions (and types): every export is a public endpoint. Move helpers to a non-exported function or another file.',
              ),
            );
            continue;
          }
          if (!startsWithSessionGuard(statement as ts.FunctionDeclaration)) {
            const line = lineOf(sf, statement);
            if (!allowed(file, line, "public-action")) {
              out.push({
                rule: "actions-contract",
                file: file.path,
                line,
                message:
                  "Every server action starts with `await requireSession()` (or requireAdmin()). A genuinely public action needs // arch-allow(public-action): <reason> above it.",
              });
            }
          }
        }
        return out;
      },
    ),
};

const routeHandlers: Rule = {
  id: "route-handler-writes",
  description:
    "Route handlers exist only for webhooks, jobs and Better Auth: a route.ts exporting POST/PUT/PATCH/DELETE must live under api/auth, api/*/webhook or api/jobs.",
  check: (files) =>
    perFile(
      files,
      (path) => /^apps\/web\/src\/app\/.*\/route\.ts$/.test(path),
      (file, sf) => {
        if (/\/api\/(?:auth\/|jobs\/|[^/]+\/webhook\/)/.test(file.path)) return [];
        const out: Array<Violation | null> = [];
        for (const statement of sf.statements) {
          const mutating = (name: string) => /^(?:POST|PUT|PATCH|DELETE)$/.test(name);
          const exported = ts
            .getModifiers(statement as ts.HasModifiers)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
          if (!exported) continue;
          const names: string[] = [];
          if (ts.isFunctionDeclaration(statement) && statement.name)
            names.push(statement.name.text);
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
            }
          }
          if (names.some(mutating)) {
            out.push(
              violation(
                "route-handler-writes",
                file,
                sf,
                statement,
                "Internal writes go through Server Actions. Route handlers are for webhooks (api/*/webhook), jobs (api/jobs) and Better Auth only.",
              ),
            );
          }
        }
        return out;
      },
    ),
};

const NAVIGATION_CALLS = new Set(["push", "replace", "prefetch"]);

function isInternalPathLiteral(node: ts.Node | undefined): boolean {
  if (!node) return false;
  if (ts.isStringLiteralLike(node)) return /^\/(?!\/)/.test(node.text);
  if (ts.isTemplateExpression(node)) return /^\/(?!\/)/.test(node.head.text);
  return false;
}

const noPathLiterals: Rule = {
  id: "no-path-literals",
  description:
    "Internal links and redirects take their path from lib/routes.ts, never a literal at the call site.",
  check: (files) =>
    perFile(
      files,
      (path) => WEB_SRC.test(path) && !isTest(path) && path !== "apps/web/src/lib/routes.ts",
      (file, sf) => {
        const out: Array<Violation | null> = [];
        const flag = (node: ts.Node) =>
          out.push(
            violation(
              "no-path-literals",
              file,
              sf,
              node,
              "Write no internal path here. Import the constant (or a path helper) from @/lib/routes, so deleting a page breaks the build instead of shipping a dead link.",
            ),
          );
        visit(sf, (node) => {
          if (ts.isCallExpression(node)) {
            const name = calleeName(node);
            const args = node.arguments;
            if (
              (name === "redirect" || name === "permanentRedirect") &&
              isInternalPathLiteral(args[0])
            ) {
              flag(node);
            } else if (name === "localizedPath" && isInternalPathLiteral(args[1])) {
              flag(node);
            } else if (
              name &&
              NAVIGATION_CALLS.has(name) &&
              ts.isPropertyAccessExpression(node.expression) &&
              isInternalPathLiteral(args[0])
            ) {
              flag(node);
            }
          } else if (ts.isJsxAttribute(node) && node.name.getText(sf) === "href") {
            const init = node.initializer;
            if (init && ts.isStringLiteral(init) && isInternalPathLiteral(init)) flag(node);
            else if (init && ts.isJsxExpression(init) && isInternalPathLiteral(init.expression)) {
              flag(node);
            }
          }
        });
        return out;
      },
    ),
};

const TAG_CALLS = new Set(["updateTag", "revalidateTag", "cacheTag"]);

const cacheTagsOnly: Rule = {
  id: "cache-tags-only",
  description:
    "updateTag / revalidateTag / cacheTag take a name built by cacheTags.*(...), never a string; revalidatePath is banned (Biome).",
  check: (files) =>
    perFile(
      files,
      (path) => WEB_SRC.test(path) && !isTest(path) && path !== "apps/web/src/lib/cache-tags.ts",
      (file, sf) => {
        const out: Array<Violation | null> = [];
        visit(sf, (node) => {
          if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
          if (!TAG_CALLS.has(node.expression.text)) return;
          const arg = node.arguments[0];
          const fromCacheTags =
            !!arg &&
            ts.isCallExpression(arg) &&
            ts.isPropertyAccessExpression(arg.expression) &&
            ts.isIdentifier(arg.expression.expression) &&
            arg.expression.expression.text === "cacheTags";
          if (!fromCacheTags) {
            out.push(
              violation(
                "cache-tags-only",
                file,
                sf,
                node,
                `${node.expression.text}() takes cacheTags.<name>(...) from @/lib/cache-tags. A hand-written tag is a typo nobody can see.`,
              ),
            );
          }
        });
        return out;
      },
    ),
};

const REQUEST_READS = new Set([
  "cookies",
  "headers",
  "draftMode",
  "requireSession",
  "requireAdmin",
  "getSession",
  "getRequestInfo",
]);

const useCachePurity: Rule = {
  id: "use-cache-purity",
  description:
    '"use cache" functions are pure functions of their arguments: no cookies(), headers(), session or request reads inside.',
  check: (files) =>
    perFile(
      files,
      (path) => WEB_SRC.test(path) && !isTest(path),
      (file, sf) => {
        const out: Array<Violation | null> = [];
        const scan = (root: ts.Node) =>
          visit(root, (node) => {
            if (ts.isCallExpression(node)) {
              const name = calleeName(node);
              if (name && REQUEST_READS.has(name)) {
                out.push(
                  violation(
                    "use-cache-purity",
                    file,
                    sf,
                    node,
                    `${name}() inside "use cache": one user's data would be served to the next. Take the user id as a parameter and put it in the tag.`,
                  ),
                );
              }
            }
          });
        if (directives(sf.statements).includes("use cache")) scan(sf);
        else {
          visit(sf, (node) => {
            const body =
              (ts.isFunctionDeclaration(node) ||
                ts.isFunctionExpression(node) ||
                ts.isArrowFunction(node) ||
                ts.isMethodDeclaration(node)) &&
              node.body &&
              ts.isBlock(node.body)
                ? node.body
                : null;
            if (body && directives(body.statements).includes("use cache")) scan(body);
          });
        }
        return out;
      },
    ),
};

const noRawSql: Rule = {
  id: "no-raw-sql-in-features",
  description:
    "No raw SQL in feature code (sql`...`, db.execute, .unsafe): a complex query is a named, tested function in packages/db.",
  check: (files) =>
    perFile(
      files,
      (path) => FEATURE_FILE.test(path) && !isTest(path),
      (file, sf) => {
        const out: Array<Violation | null> = [];
        const flag = (node: ts.Node) =>
          out.push(
            violation(
              "no-raw-sql-in-features",
              file,
              sf,
              node,
              "Raw SQL in feature code. Put the query in packages/db with a name and a test, or express it with the query builder.",
            ),
          );
        visit(sf, (node) => {
          if (
            ts.isTaggedTemplateExpression(node) &&
            ((ts.isIdentifier(node.tag) && node.tag.text === "sql") ||
              (ts.isPropertyAccessExpression(node.tag) &&
                ts.isIdentifier(node.tag.expression) &&
                node.tag.expression.text === "sql"))
          ) {
            flag(node);
          } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            if (
              method === "unsafe" ||
              (method === "execute" &&
                node.expression.expression.kind !== ts.SyntaxKind.ThisKeyword)
            ) {
              flag(node);
            }
          }
        });
        return out;
      },
    ),
};

const clientNoDbBarrel: Rule = {
  id: "client-no-db-barrel",
  description:
    '"use client" files import row schemas from @repo/db/schema, never the @repo/db barrel (it carries the Postgres client).',
  check: (files) =>
    perFile(
      files,
      (path) => WEB_SRC.test(path),
      (file, sf) => {
        if (!directives(sf.statements).includes("use client")) return [];
        return importsOf(sf)
          .filter((ref) => ref.specifier === "@repo/db" && !ref.typeOnly)
          .map((ref) =>
            violation(
              "client-no-db-barrel",
              file,
              sf,
              ref.node,
              'A "use client" file imports the @repo/db barrel. Import from @repo/db/schema (or use `import type`).',
            ),
          );
      },
    ),
};

const noSessionInTry: Rule = {
  id: "no-session-in-try",
  description:
    "requireSession() / requireAdmin() are never wrapped in try/catch: they redirect by throwing.",
  check: (files) =>
    perFile(
      files,
      (path) => WEB_SRC.test(path) && !isTest(path),
      (file, sf) => {
        const out: Array<Violation | null> = [];
        visit(sf, (node) => {
          if (!ts.isTryStatement(node)) return;
          visit(node.tryBlock, (inner) => {
            if (
              ts.isCallExpression(inner) &&
              ts.isIdentifier(inner.expression) &&
              SESSION_GUARDS.has(inner.expression.text)
            ) {
              out.push(
                violation(
                  "no-session-in-try",
                  file,
                  sf,
                  inner,
                  "requireSession() redirects by throwing; a catch-all swallows the redirect. Call it outside the try block.",
                ),
              );
            }
          });
        });
        return out;
      },
    ),
};

const edgeEnv: Rule = {
  id: "edge-env",
  description:
    "middleware.ts and everything it imports use @repo/env/edge, never @repo/env, @repo/db or the full @repo/auth.",
  check: (files) => {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const resolve = (from: string, specifier: string): string | null => {
      const base = resolveLocal(from, specifier);
      if (!base) return null;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
        if (byPath.has(candidate)) return candidate;
      }
      return null;
    };
    const out: Violation[] = [];
    const seen = new Set<string>();
    const queue = ["apps/web/src/middleware.ts"].filter((path) => byPath.has(path));
    while (queue.length) {
      const path = queue.shift() as string;
      if (seen.has(path)) continue;
      seen.add(path);
      const file = byPath.get(path) as SourceFile;
      const sf = parse(file);
      for (const ref of importsOf(sf)) {
        if (ref.typeOnly) continue;
        if (/^@repo\/(?:env|db|auth)$/.test(ref.specifier)) {
          const found = violation(
            "edge-env",
            file,
            sf,
            ref.node,
            `${ref.specifier} reached from middleware.ts (via ${path}). Edge code imports @repo/env/edge and @repo/auth/edge; the main schema makes DATABASE_URL a startup requirement for the middleware.`,
          );
          if (found) out.push(found);
        }
        const next = resolve(path, ref.specifier);
        if (next) queue.push(next);
      }
    }
    return out;
  },
};

const tsExpectErrorReason: Rule = {
  id: "ts-expect-error-reason",
  description: "@ts-expect-error / @ts-ignore must carry an explanation of at least a few words.",
  check: (files) => {
    const out: Violation[] = [];
    for (const file of files) {
      if (!isScript(file.path)) continue;
      file.text.split("\n").forEach((line, index) => {
        const match = /(?:\/\/|\/\*)\s*@ts-(expect-error|ignore)\b(.*)$/.exec(line);
        if (!match) return;
        const reason = (match[2] ?? "").replace(/[:\-*/\s]+/g, " ").trim();
        if (match[1] === "ignore" || reason.split(" ").filter(Boolean).length < 3) {
          out.push({
            rule: "ts-expect-error-reason",
            file: file.path,
            line: index + 1,
            message:
              "Explain a suppressed type error in the same comment (at least three words), and prefer @ts-expect-error to @ts-ignore.",
          });
        }
      });
    }
    return out;
  },
};

const noStrictDynamic: Rule = {
  id: "csp-no-strict-dynamic",
  description:
    "The CSP never contains 'strict-dynamic': it makes the browser ignore 'self' and blocks prerendered scripts.",
  check: (files) =>
    perFile(
      files,
      (path) =>
        (/^apps\/web\/src\/(?:lib|middleware)/.test(path) || path === "apps/web/next.config.ts") &&
        !isTest(path),
      (file, sf) => {
        const out: Array<Violation | null> = [];
        visit(sf, (node) => {
          if (
            (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) &&
            node.text.includes("strict-dynamic")
          ) {
            out.push(
              violation(
                "csp-no-strict-dynamic",
                file,
                sf,
                node,
                "'strict-dynamic' in the CSP blocks every script on a prerendered page. See ARCHITECTURE.md section 10.",
              ),
            );
          }
        });
        return out;
      },
    ),
};

const testsUseTransaction: Rule = {
  id: "db-tests-use-transaction",
  description:
    "A test that imports @repo/db calls setupTestTransaction() (or mocks @repo/db), so it never leaves state behind.",
  check: (files) =>
    perFile(
      files,
      (path) => isTest(path) && /\.test\.[jt]sx?$/.test(path) && !path.startsWith("packages/db/"),
      (file, sf) => {
        // Only the `db` client matters: importing table objects to inspect them writes nothing.
        const usesDb = importsOf(sf).some(
          (ref) => ref.specifier === "@repo/db" && !ref.typeOnly && ref.names.includes("db"),
        );
        const safe =
          file.text.includes("setupTestTransaction(") ||
          /vi\.mock\(\s*["']@repo\/db["']/.test(file.text);
        if (!usesDb || safe) return [];
        return [
          violation(
            "db-tests-use-transaction",
            file,
            sf,
            sf.statements[0] ?? sf,
            "This test imports @repo/db but never calls setupTestTransaction() from @repo/db/testing, so what it writes is not rolled back.",
          ),
        ];
      },
    ),
};

// ------------------------------------------------------------ data-shaped rules

/** Keys of `FOO: z.…` entries in the env schemas, and of `FOO=` lines in .env.example. */
export function envSchemaKeys(sources: string[]): Set<string> {
  const keys = new Set<string>();
  for (const source of sources) {
    // Only the validator blocks, not runtimeEnv: entries there look like `FOO: process.env.FOO`.
    for (const match of source.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):\s*z\b/gm))
      keys.add(match[1] as string);
    for (const match of source.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):\s*$/gm))
      keys.add(match[1] as string);
  }
  return keys;
}

export function envExampleKeys(example: string): Set<string> {
  const keys = new Set<string>();
  for (const match of example.matchAll(/^#?\s?([A-Z][A-Z0-9_]+)=/gm)) keys.add(match[1] as string);
  return keys;
}

/** Variables the platform provides; they have no business in .env.example. */
const PLATFORM_VARIABLES = /^(?:VERCEL_.*|CI|SKIP_ENV_VALIDATION|BASE_URL)$/;

const envParity: Rule = {
  id: "env-parity",
  description:
    "Every variable in the @repo/env schemas is in .env.example, and every variable in .env.example is in a schema.",
  check: (files) => {
    const example = files.find((file) => file.path === ".env.example");
    const schemas = files.filter((file) =>
      /^packages\/env\/src\/(?:index|edge)\.ts$/.test(file.path),
    );
    if (!example || schemas.length === 0) return [];
    const schema = envSchemaKeys(schemas.map((file) => file.text));
    const documented = envExampleKeys(example.text);
    const out: Violation[] = [];
    for (const key of schema) {
      if (!documented.has(key) && !PLATFORM_VARIABLES.test(key)) {
        out.push({
          rule: "env-parity",
          file: ".env.example",
          line: 1,
          message: `${key} is validated in packages/env but missing from .env.example. Add it (commented out if optional) in the same change.`,
        });
      }
    }
    for (const key of documented) {
      if (!schema.has(key)) {
        out.push({
          rule: "env-parity",
          file: ".env.example",
          line: 1,
          message: `${key} is in .env.example but not validated in packages/env. Add it to the schema in the same change.`,
        });
      }
    }
    return out;
  },
};

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const messageParity: Rule = {
  id: "messages-parity",
  description: "apps/web/messages/en.json and es.json have exactly the same keys.",
  check: (files) => {
    const en = files.find((file) => file.path === "apps/web/messages/en.json");
    const es = files.find((file) => file.path === "apps/web/messages/es.json");
    if (!en || !es) return [];
    const enKeys = new Set(flattenKeys(JSON.parse(en.text)));
    const esKeys = new Set(flattenKeys(JSON.parse(es.text)));
    const out: Violation[] = [];
    for (const key of enKeys) {
      if (!esKeys.has(key)) {
        out.push({
          rule: "messages-parity",
          file: es.path,
          line: 1,
          message: `"${key}" is in en.json but missing from es.json.`,
        });
      }
    }
    for (const key of esKeys) {
      if (!enKeys.has(key)) {
        out.push({
          rule: "messages-parity",
          file: en.path,
          line: 1,
          message: `"${key}" is in es.json but missing from en.json.`,
        });
      }
    }
    return out;
  },
};

const archAllowReason: Rule = {
  id: "arch-allow-reason",
  description: "Every arch-allow(...) escape hatch states a reason.",
  check: (files) => {
    const out: Violation[] = [];
    for (const file of files) {
      if (!isScript(file.path)) continue;
      file.text.split("\n").forEach((line, index) => {
        if (/arch-allow\([\w-]+\)/.test(line) && !/arch-allow\([\w-]+\):\s*\S.{5,}/.test(line)) {
          out.push({
            rule: "arch-allow-reason",
            file: file.path,
            line: index + 1,
            message:
              "arch-allow needs a colon and a reason: // arch-allow(rule-id): why this is safe.",
          });
        }
      });
    }
    return out;
  },
};

/**
 * Applied migrations are history: rewriting one breaks every database that ran
 * it. `changes` is `git diff --name-status <base>` restricted to the migrations
 * folder; adding files (and appending to the journal) is fine.
 */
export function migrationChanges(changes: Array<{ status: string; path: string }>): Violation[] {
  return changes
    .filter(
      (change) =>
        /^packages\/db\/migrations\/(?:[^/]+\.sql|meta\/\d{4}_snapshot\.json)$/.test(change.path) &&
        !change.status.startsWith("A"),
    )
    .map((change) => ({
      rule: "migrations-immutable",
      file: change.path,
      line: 1,
      message: `An applied migration was ${change.status.startsWith("D") ? "deleted" : "edited"}. Generate a new migration instead (pnpm db:generate).`,
    }));
}

export const RULES: Rule[] = [
  noCrossFeatureImports,
  packagesNeverImportApps,
  noRelativeEscape,
  packageGraph,
  ...restrictedImports(),
  serverOnlyQueries,
  actionsFiles,
  routeHandlers,
  noPathLiterals,
  cacheTagsOnly,
  useCachePurity,
  noRawSql,
  clientNoDbBarrel,
  noSessionInTry,
  edgeEnv,
  tsExpectErrorReason,
  noStrictDynamic,
  testsUseTransaction,
  envParity,
  messageParity,
  archAllowReason,
];

// ------------------------------------------------------------- escape ledger

/**
 * Every deliberate exception to a rule: `arch-allow(<rule>): <reason>` and
 * `biome-ignore lint/plugin: <reason>`. They are committed in escapes.json so
 * adding or removing one is a visible, reviewable change instead of a comment
 * nobody notices.
 */
export interface Escape {
  file: string;
  rule: string;
  reason: string;
  count: number;
}

const ARCH_ALLOW = /^\s*\/\/\s*arch-allow\(([\w-]+)\):\s*(.+?)\s*$/;
const BIOME_IGNORE =
  /^\s*(?:\/\/|\/\*)\s*biome-ignore(?:-all)?\s+lint\/plugin(?:\/[\w-]+)?\s*:\s*(.+?)\s*(?:\*\/)?$/;

export function collectEscapes(files: SourceFile[]): Escape[] {
  const byKey = new Map<string, Escape>();
  for (const file of files) {
    if (!isScript(file.path)) continue;
    for (const line of file.text.split("\n")) {
      const arch = ARCH_ALLOW.exec(line);
      const biome = arch ? null : BIOME_IGNORE.exec(line);
      const found = arch
        ? { rule: arch[1] as string, reason: arch[2] as string }
        : biome
          ? { rule: "biome-ignore lint/plugin", reason: biome[1] as string }
          : null;
      if (!found) continue;
      const key = `${file.path}\u0000${found.rule}\u0000${found.reason}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { file: file.path, ...found, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.file}|${a.rule}|${a.reason}`.localeCompare(`${b.file}|${b.rule}|${b.reason}`),
  );
}

/**
 * Compare the escapes found in the code with the committed ledger. An entry whose
 * file no longer exists is ignored: `project:init` deletes the example feature
 * wholesale, and its escapes go with it.
 */
export function diffEscapes(
  found: Escape[],
  committed: Escape[],
  fileExists: (path: string) => boolean,
): Violation[] {
  const key = (e: Escape) => `${e.file}\u0000${e.rule}\u0000${e.reason}`;
  const have = new Map(found.map((e) => [key(e), e]));
  const out: Violation[] = [];
  for (const e of found) {
    const recorded = committed.find((c) => key(c) === key(e))?.count ?? 0;
    if (e.count > recorded) {
      out.push({
        rule: "escape-ledger",
        file: e.file,
        line: 1,
        message: `New escape (${e.rule}: "${e.reason}") is not in apps/web/src/__arch__/escapes.json. A human must review it: add it to the ledger in the same change.`,
      });
    }
  }
  for (const c of committed) {
    if (!fileExists(c.file)) continue;
    if ((have.get(key(c))?.count ?? 0) < c.count) {
      out.push({
        rule: "escape-ledger",
        file: c.file,
        line: 1,
        message: `The escape (${c.rule}: "${c.reason}") was removed or changed but escapes.json still lists it. Update the ledger in the same change.`,
      });
    }
  }
  return out;
}
