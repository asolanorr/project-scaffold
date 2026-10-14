#!/usr/bin/env node
// One-shot project setup. Turns a fresh clone of the scaffold into your project,
// then deletes itself.
//
//   pnpm run setup                     interactive
//   pnpm run setup -- --name "Acme" --slug acme --no-example     non-interactive
//   pnpm run setup -- --dry-run ...    plan and check, write nothing
//
// (`pnpm setup` without `run` is pnpm's own built-in PATH command and never
// reaches this script.)
//
// Everything is planned in memory first: every edit is applied to a copy of the
// tree, and the copy is scanned for dangling references to the removed example.
// Any problem aborts with file:line before a single byte is written.
//
// Built-ins only: no dependency to install, and nothing to uninstall at the end.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "scripts/setup.mjs";
const SCAFFOLD_SLUG = "scaffold";

class SetupError extends Error {}

let wroteFiles = false;

const fail = (message) => {
  throw new SetupError(message);
};

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { name: null, slug: null, keepExample: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    const [flag, inline] = arg.split(/=(.*)/s);
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) fail(`${flag} needs a value.`);
      return next;
    };
    if (flag === "--name") opts.name = value();
    else if (flag === "--slug") opts.slug = value();
    else if (flag === "--keep-example") opts.keepExample = true;
    else if (flag === "--no-example") opts.keepExample = false;
    else if (flag === "--dry-run") opts.dryRun = true;
    else if (flag === "--help" || flag === "-h") opts.help = true;
    else fail(`Unknown option ${arg}. Try --help.`);
  }
  return opts;
}

const HELP = `Usage: pnpm run setup [-- options]

  --name <text>      Display name, e.g. "Acme Cloud"
  --slug <text>      Lowercase letters, digits and hyphens, e.g. acme-cloud
  --keep-example     Keep the example "projects" feature
  --no-example       Delete the example "projects" feature completely
  --dry-run          Plan and check everything, write nothing

With all three of name, slug and an example flag, nothing is prompted for.`;

const validateName = (name) =>
  /^[\p{L}\p{N}][\p{L}\p{N} .-]{0,38}$/u.test(name) && name === name.trim()
    ? null
    : "Name: 1-39 characters, letters, digits, spaces, dots and hyphens only.";

const validateSlug = (slug) => {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40) {
    return "Slug: 2-40 characters, lowercase letters, digits and single hyphens, starting with a letter.";
  }
  if (slug === SCAFFOLD_SLUG)
    return `Slug cannot be "${SCAFFOLD_SLUG}": that is the name being replaced.`;
  return null;
};

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function collectInputs(opts) {
  const complete = opts.name !== null && opts.slug !== null && opts.keepExample !== null;
  if (!complete && !process.stdin.isTTY) {
    fail(
      "Not an interactive terminal and some inputs are missing. Pass --name, --slug and " +
        "--keep-example or --no-example.",
    );
  }
  const rl = complete ? null : createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (question, validate, fallback) => {
      for (;;) {
        const raw = (
          await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)
        ).trim();
        const answer = raw || fallback || "";
        const problem = validate(answer);
        if (!problem) return answer;
        console.log(`  ${problem}`);
      }
    };
    const name = opts.name ?? (await ask("Project display name", validateName));
    const nameProblem = validateName(name);
    if (nameProblem) fail(nameProblem);

    const slug = opts.slug ?? (await ask("Project slug", validateSlug, slugify(name) || undefined));
    const slugProblem = validateSlug(slug);
    if (slugProblem) fail(slugProblem);

    let keepExample = opts.keepExample;
    if (keepExample === null) {
      const answer = await ask(
        'Keep the example "projects" feature? (y/n)',
        (a) => (/^(y|n|yes|no)$/i.test(a) ? null : "Answer y or n."),
        "y",
      );
      keepExample = /^y/i.test(answer);
    }
    return { name, slug, keepExample };
  } finally {
    rl?.close();
  }
}

// --------------------------------------------------------------- virtual tree

/** Tracked files, text only, never the ones that must stay byte-identical. */
const NEVER_TOUCH = [
  "pnpm-lock.yaml",
  SELF,
  // Applied migrations are history: rewriting one breaks every database that ran it.
  /^packages\/db\/migrations\//,
  /^packages\/ui\/src\/fonts\//,
  /(^|\/)LICENSE[^/]*$/,
];

const skipped = (path) =>
  NEVER_TOUCH.some((rule) => (typeof rule === "string" ? rule === path : rule.test(path)));

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail("This script needs a git checkout (git ls-files failed).");
  return result.stdout.split("\0").filter(Boolean);
}

class Tree {
  /** path -> { text, crlf, original } for every tracked text file. */
  files = new Map();
  deleted = new Set();
  /** Every tracked path, text or not: what an <include> may legitimately point at. */
  tracked;
  /** Docs pages that lost a code excerpt and need a human to rewrite them. */
  rewriteDocs = new Set();

  constructor(paths) {
    this.tracked = new Set(paths);
    for (const path of paths) {
      if (skipped(path)) continue;
      const buffer = readFileSync(join(ROOT, path));
      if (buffer.includes(0)) continue;
      const raw = buffer.toString("utf8");
      const crlf = raw.includes("\r\n");
      const text = crlf ? raw.replaceAll("\r\n", "\n") : raw;
      this.files.set(path, { text, crlf, original: text });
    }
  }

  get(path) {
    const file = this.files.get(path);
    if (!file || this.deleted.has(path))
      fail(
        `Expected ${path} to exist, but it does not. The scaffold has drifted from this script.`,
      );
    return file.text;
  }

  set(path, text) {
    this.get(path);
    this.files.get(path).text = text;
  }

  /** Replace `pattern` exactly where expected; a miss means the file drifted. */
  replace(path, pattern, replacement, { all = false } = {}) {
    const text = this.get(path);
    const matches = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
    if (typeof pattern !== "string") pattern.lastIndex = 0;
    if (!matches)
      fail(
        `${path}: expected to find ${pattern} but did not. The file has drifted from this script.`,
      );
    const next =
      typeof pattern === "string"
        ? text[all ? "replaceAll" : "replace"](pattern, () => replacement)
        : text.replace(pattern, () => replacement);
    this.set(path, next);
  }

  json(path, mutate) {
    const text = this.get(path);
    const data = JSON.parse(text);
    // Writing JSON back is only safe if re-serialising is lossless.
    if (`${JSON.stringify(data, null, 2)}\n` !== text) {
      fail(`${path}: not in canonical 2-space JSON, so it cannot be edited safely.`);
    }
    mutate(data);
    this.set(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  deleteWhere(test, label) {
    const hits = [...this.files.keys()].filter((path) => !this.deleted.has(path) && test(path));
    if (hits.length === 0) fail(`Expected files for ${label} but found none.`);
    for (const path of hits) this.deleted.add(path);
  }

  live() {
    return [...this.files].filter(([path]) => !this.deleted.has(path));
  }

  changed() {
    return this.live()
      .filter(([, file]) => file.text !== file.original)
      .map(([path]) => path);
  }
}

// ------------------------------------------------------------------- renaming

/**
 * `Scaffold` (capitalised) is only ever the product name here. Lowercase
 * `scaffold` is the slug when it is glued to an identifier character
 * (`scaffold_test`, `scaffold-web`, `/scaffold`, `"scaffold"`) and prose
 * otherwise ("the scaffold recommends") — prose is left alone and reported.
 */
function renameInTree(tree, name, slug) {
  const slugAdjacent = /[-_/"'`=@]/;
  for (const [path, file] of tree.live()) {
    let text = file.text;
    text = text.replaceAll("App Scaffold", () => name);
    text = text.replace(/\bScaffold\b/g, () => name);
    text = text.replace(/(?<![A-Za-z0-9])scaffold(?![A-Za-z0-9])/g, (match, offset, whole) => {
      const before = whole[offset - 1] ?? "";
      const after = whole[offset + match.length] ?? "";
      const glued = slugAdjacent.test(before) || slugAdjacent.test(after);
      const asArgument = /(?:cd |<your fork> )$/.test(
        whole.slice(Math.max(0, offset - 16), offset),
      );
      return glued || asArgument ? slug : match;
    });
    if (text !== file.text) tree.set(path, text);
  }
  tree.json("package.json", (pkg) => {
    if (pkg.name !== slug) fail(`package.json: expected the name to become "${slug}".`);
  });
}

// ------------------------------------------------------------ example removal

function removeExample(tree) {
  tree.deleteWhere((p) => p.startsWith("apps/web/src/features/projects/"), "features/projects");
  tree.deleteWhere(
    (p) => p.startsWith("apps/web/src/app/[locale]/(app)/projects/"),
    "the projects routes",
  );
  tree.deleteWhere((p) => p === "packages/db/src/schema/projects.ts", "the projects schema");
  tree.deleteWhere((p) => p === "e2e/projects.spec.ts", "the projects e2e spec");
  tree.deleteWhere(
    (p) => p === "apps/docs/content/docs/example-crud.mdx",
    "the example-crud doc page",
  );

  tree.replace("packages/db/src/schema/index.ts", 'export * from "./projects";\n', "");

  const routes = "apps/web/src/lib/routes.ts";
  tree.replace(
    routes,
    /\/\/ The projects feature is the reference implementation[\s\S]*?export function projectEditPath[\s\S]*?\n\}\n\n/,
    "",
  );
  tree.replace(routes, /const _project(?:Edit)?RouteExists[^\n]*\n/g, "");
  tree.replace(routes, /void _project(?:Edit)?RouteExists;\n/g, "");
  tree.replace(routes, "[DASHBOARD_PATH, PROJECTS_PATH]", "[DASHBOARD_PATH]");

  const tags = "apps/web/src/lib/cache-tags.ts";
  tree.replace(
    tags,
    / {2}\/\*\* Every project belonging to one user\. \*\/\n {2}projects: [^\n]*\n {2}\/\*\* One project, for the detail view\. \*\/\n {2}project: [^\n]*\n/,
    "",
  );
  // Comment examples that named the feature; keep them meaningful.
  tree.replace(tags, "porjects:u_1", "flies:u_1");
  tree.replace(tags, "/[locale]/(app)/projects", "/[locale]/(app)/dashboard");
  tree.replace(tags, 'revalidatePath("/projects")', 'revalidatePath("/dashboard")');

  const tagsTest = "apps/web/src/lib/__tests__/cache-tags.test.ts";
  tree.replace(tagsTest, "cacheTags.projects(", "cacheTags.files(", { all: true });
  tree.replace(tagsTest, "cacheTags.project(", "cacheTags.file(", { all: true });
  tree.replace(tagsTest, '"projects:u_1"', '"files:u_1"');
  tree.replace(tagsTest, '"projects:u_2"', '"files:u_2"');
  tree.replace(tagsTest, "a user's projects", "a user's files");

  const dashboard = "apps/web/src/app/[locale]/(app)/dashboard/page.tsx";
  tree.replace(
    dashboard,
    'import { Button } from "@repo/ui/components/base/buttons/button";\n',
    "",
  );
  tree.replace(dashboard, 'import { PROJECTS_PATH } from "@/lib/routes";\n', "");
  tree.replace(
    dashboard,
    '      <div>\n        <Button color="secondary" href={PROJECTS_PATH}>\n          {t("projectsLink")}\n        </Button>\n      </div>\n\n',
    "",
  );

  for (const messages of ["apps/web/messages/en.json", "apps/web/messages/es.json"]) {
    tree.json(messages, (data) => {
      if (!("projects" in data) || !data.dashboard || !("projectsLink" in data.dashboard)) {
        fail(`${messages}: expected the "projects" namespace and "dashboard.projectsLink".`);
      }
      delete data.projects;
      delete data.dashboard.projectsLink;
    });
  }

  tree.replace(
    "apps/web/src/app/[locale]/providers.tsx",
    "(`/projects/[id]`)",
    "(`/admin/users/[id]`)",
  );
  tree.replace(
    "packages/auth/src/__tests__/ownership.test.ts",
    "feature table like `projects`",
    "feature table like `files`",
  );

  const seed = "packages/auth/src/seed.ts";
  tree.replace(
    seed,
    'const { db, files, projects, users } = await import("@repo/db");',
    'const { db, files, users } = await import("@repo/db");',
  );
  tree.replace(seed, /const PROJECT_STATUSES[\s\S]*?const LIVE_PROJECT_COUNT = 22;\n\n/, "");
  tree.replace(seed, /their projects and\n\s*\/\/ files,/, "their files,\n  //");
  tree.replace(
    seed,
    'const otherId = await createSeedAccount(OTHER_EMAIL, "Other");',
    'await createSeedAccount(OTHER_EMAIL, "Other");',
  );
  tree.replace(seed, / {2}const liveProjects = [\s\S]*?\n {2}\]\);\n\n/, "");
  tree.replace(
    seed,
    /`Seeded \$\{LIVE_PROJECT_COUNT \+ 2\} projects and 1 pending file\.`/,
    '"Seeded 1 pending file."',
  );
  tree.replace(seed, "owns the projects above", "owns the pending file above");
  tree.replace(seed, "owns one project of their own;", "a second account with no data of its own;");
  tree.replace(
    seed,
    "confirm the owner's projects are not there",
    "confirm the owner's data is not there",
  );

  tree.replace(
    "apps/docs/content/docs/index.mdx",
    / {2}<Card title="The example CRUD"[^\n]*\n/,
    "",
  );
  tree.json("apps/docs/content/docs/meta.json", (meta) => {
    if (!meta.pages.includes("example-crud")) fail("meta.json: expected an example-crud entry.");
    meta.pages = meta.pages.filter((page) => page !== "example-crud");
  });
  tree.replace(
    "apps/docs/content/docs/getting-started.mdx",
    "Sign up at `/sign-up`, land on `/dashboard`, open `/projects`.",
    "Sign up at `/sign-up` and land on `/dashboard`.",
  );

  // The docs site embeds source files with <include>. One pointing at a deleted
  // file fails the docs build, so each is replaced by an MDX comment: invisible
  // to readers, greppable, and the page is reported for a human to rewrite.
  for (const [path] of tree.live()) {
    if (!path.endsWith(".mdx")) continue;
    const next = tree.get(path).replace(INCLUDE_LINE, (line, target) => {
      if (!tree.deleted.has(includeTarget(path, target))) return line;
      tree.rewriteDocs.add(path);
      return "{/* setup: the example code quoted here was removed with the projects feature */}\n";
    });
    tree.set(path, next);
  }
}

/** One `<include ...>relative/path#region</include>` per line, as the docs write them. */
const INCLUDE_LINE = /^<include\b[^>]*>([^<\n]*)<\/include>\n/gm;

/** Repo-relative path an include resolves to (MDX escapes `_` as `\_`). */
const includeTarget = (mdxPath, target) =>
  posix.normalize(posix.join(posix.dirname(mdxPath), target.split("#")[0].replaceAll("\\_", "_")));

// --------------------------------------------------------------- dangling scan

/** Code, config and message files: any surviving reference to the example is a bug. */
const HARD_PATTERNS = [
  [/features\/projects\b/, "imports the removed projects feature"],
  [/\bPROJECTS(?:_NEW)?_PATH\b/, "uses a removed route constant"],
  [/\b(?:projectPath|projectEditPath)\b/, "uses a removed route helper"],
  [/\bcacheTags\.projects?\b/, "uses a removed cache tag"],
  [
    /\b(?:projectColumns|ProjectView|NewProject|insertProjectSchema|updateProjectSchema|selectProjectSchema|projectStatus)\b/,
    "uses a removed schema export",
  ],
  [/\bimport\b.*\bprojects\b.*from\s+["']@repo\/db/, "imports the removed projects table"],
  [
    /\bdb\.query\.projects\b|\.(?:from|insert|update|delete)\(projects\)/,
    "queries the removed table",
  ],
  [/(?:useTranslations|getTranslations)\(\s*["'`]projects/, "reads the removed messages namespace"],
  [/["'`]projectsLink["'`]/, "reads the removed dashboard message key"],
  [/["'`]\/projects(?:[/"'`?#]|\$\{)/, "links to a removed route"],
  [/example-crud/, "links to the removed example-crud page"],
];

/** Docs prose may still talk about the example (reported), but never link to it. */
const DOC_HARD_PATTERNS = [
  [/example-crud/, "links to the removed example-crud page"],
  [/\]\([^)]*(?:features\/projects|\/projects)[^)]*\)/, "markdown link to the removed example"],
];

const isDoc = (path) => /\.(?:md|mdx)$/.test(path);

function scanForDanglingReferences(tree) {
  const problems = [];
  for (const [path, file] of tree.live()) {
    const patterns = isDoc(path) ? DOC_HARD_PATTERNS : HARD_PATTERNS;
    file.text.split("\n").forEach((line, index) => {
      for (const [pattern, why] of patterns) {
        if (pattern.test(line)) problems.push(`${path}:${index + 1}  ${why}\n    ${line.trim()}`);
      }
      for (const [, target] of line.matchAll(/<include\b[^>]*>([^<]*)<\/include>/g)) {
        const resolved = includeTarget(path, target);
        if (tree.deleted.has(resolved) || !tree.tracked.has(resolved)) {
          problems.push(
            `${path}:${index + 1}  <include> of a file that no longer exists\n    ${line.trim()}`,
          );
        }
      }
    });
  }
  return problems;
}

function mentionsAfter(tree, pattern, docsOnly) {
  const rows = [];
  for (const [path, file] of tree.live()) {
    if (docsOnly && !isDoc(path)) continue;
    const lines = file.text.split("\n").flatMap((line, i) => (pattern.test(line) ? [i + 1] : []));
    if (lines.length) rows.push({ path, lines });
  }
  return rows;
}

// -------------------------------------------------------------------- env file

function blankEnv(example) {
  return `${example
    .split("\n")
    .map((line) => {
      const assignment = line.match(/^([A-Z][A-Z0-9_]*)=/);
      if (assignment) return `${assignment[1]}=`;
      // A comment that embeds user:password@host is a credential, even if a default one.
      if (line.startsWith("#")) return line.replace(/\/\/[^\s/@:]*:[^\s/@]*@/g, "//USER:PASSWORD@");
      return line;
    })
    .join("\n")
    .trimEnd()}\n`;
}

// ------------------------------------------------------------------- applying

function writeTree(tree) {
  for (const path of tree.deleted) rmSync(join(ROOT, path), { force: true });
  for (const [path, file] of tree.live()) {
    if (file.text === file.original) continue;
    writeFileSync(join(ROOT, path), file.crlf ? file.text.replaceAll("\n", "\r\n") : file.text);
  }
  // Prune directories the deletions emptied (routes/features folders).
  for (const path of tree.deleted) {
    let dir = dirname(join(ROOT, path));
    while (
      dir.startsWith(ROOT) &&
      dir !== ROOT &&
      existsSync(dir) &&
      readdirSync(dir).length === 0
    ) {
      rmdirSync(dir);
      dir = dirname(dir);
    }
  }
}

function generateDropMigration() {
  const before = new Set(readdirSync(join(ROOT, "packages/db/migrations")));
  // One command string, not a shell plus an args array: pnpm is a .cmd shim on
  // Windows, and Node deprecates passing args to a shell.
  const result = spawnSync(
    "pnpm --filter @repo/db exec drizzle-kit generate --name drop_projects",
    { cwd: ROOT, stdio: "inherit", shell: true },
  );
  if (result.status !== 0) fail("drizzle-kit generate failed; see its output above.");
  const created = readdirSync(join(ROOT, "packages/db/migrations")).filter(
    (f) => f.endsWith(".sql") && !before.has(f),
  );
  if (created.length !== 1) fail(`Expected exactly one new migration, found ${created.length}.`);
  const file = `packages/db/migrations/${created[0]}`;
  const sql = readFileSync(join(ROOT, file), "utf8");
  // The migration must drop the example's table and nothing else.
  if (!/DROP TABLE "projects"/.test(sql)) fail(`${file} does not drop the projects table:\n${sql}`);
  const otherDrops = [...sql.matchAll(/DROP (?:TABLE|TYPE|INDEX) (?:"public"\.)?"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((n) => n !== "projects" && n !== "project_status");
  if (/CREATE |ALTER TABLE "(?!projects")/.test(sql) || otherDrops.length) {
    fail(`${file} changes more than the projects feature:\n${sql}`);
  }
  return file;
}

function checklist(slug, upstream) {
  return `
Manual checklist - none of this can be done from here
  1. Create a NEW Supabase project (not the scaffold's). Put its pooled URL
     (port 6543) in DATABASE_URL and its direct URL (port 5432) in DIRECT_URL.
  2. Create two Vercel projects, "${slug}-web" (Root Directory apps/web) and
     "${slug}-docs" (Root Directory apps/docs). Turn Deployment Protection ON
     for both. See docs/deployment.md.
  3. Add VERCEL_AUTOMATION_BYPASS_SECRET to the GitHub repository secrets
     (the E2E workflow cannot reach a protected preview without it).
  4. In Vercel, set ALL required server variables for BUILD as well as runtime,
     not just runtime: DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET,
     BETTER_AUTH_URL, CRON_SECRET. The build imports @repo/env, so a missing
     one fails the build before any code runs.
  5. Fill .env and .env.example together: a variable added to one belongs in
     the other, in the same change. .env.example holds placeholders only.
  6. Rotate anything shared with the scaffold: BETTER_AUTH_SECRET, CRON_SECRET
     and any key that was ever pasted into CI, chat or a shared vault.
  7. Keep a way back to the scaffold:
       git remote add upstream ${upstream}
     (point "origin" at your new repository first if it still names the scaffold)
  8. Decide who owns the repository at handoff: organisation or personal
     account, collaborators, branch protection, and re-create secrets there.
`;
}

// ------------------------------------------------------------------------ main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(HELP);

  const pkgPath = join(ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== SCAFFOLD_SLUG) {
    console.log(`Setup already ran (package name is "${pkg.name}"). Nothing was changed.`);
    return;
  }
  if (existsSync(join(ROOT, ".env"))) {
    fail(".env already exists and will not be overwritten. Move it aside and run setup again.");
  }
  if (!existsSync(join(ROOT, ".env.example"))) fail(".env.example is missing.");

  const { name, slug, keepExample } = await collectInputs(opts);

  const tree = new Tree(trackedFiles());
  renameInTree(tree, name, slug);
  if (!keepExample) removeExample(tree);

  // Only meaningful once the example is gone; with it kept, these are live references.
  const problems = keepExample ? [] : scanForDanglingReferences(tree);
  if (problems.length) {
    console.error("\nDangling references would remain. Nothing was written.\n");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  const changed = tree.changed();
  const envText = blankEnv(tree.get(".env.example"));

  if (opts.dryRun) {
    console.log(
      `Dry run: ${changed.length} files would change, ${tree.deleted.size} would be deleted.`,
    );
    for (const path of changed) console.log(`  changed  ${path}`);
    for (const path of [...tree.deleted].sort()) console.log(`  deleted  ${path}`);
    return;
  }

  const upstream =
    spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout?.trim() || "<scaffold-url>";

  writeTree(tree);
  wroteFiles = true;
  writeFileSync(join(ROOT, ".env"), envText, { flag: "wx" });

  const migration = keepExample ? null : generateDropMigration();

  console.log(`\nChanged ${changed.length} files:`);
  for (const path of changed) console.log(`  ${path}`);
  if (tree.deleted.size) {
    console.log(`\nDeleted ${tree.deleted.size} files (the example feature):`);
    for (const path of [...tree.deleted].sort()) console.log(`  ${path}`);
  }
  console.log("\nCreated .env (every value blank).");
  if (migration) console.log(`Created ${migration}. Apply it with: pnpm db:migrate`);

  const prose = mentionsAfter(tree, /(?<![A-Za-z0-9])scaffold(?![A-Za-z0-9])/i, false);
  if (prose.length) {
    console.log(
      "\nStill mentions the scaffold by name (prose about the template, left as written):",
    );
    for (const { path, lines } of prose) console.log(`  ${path}:${lines.join(",")}`);
  }
  if (tree.rewriteDocs.size) {
    console.log("\nDocs pages that lost a code excerpt (search for 'setup:' in each):");
    for (const path of [...tree.rewriteDocs].sort()) console.log(`  ${path}`);
  }
  if (!keepExample) {
    const docs = mentionsAfter(tree, /\bprojects\b/i, true);
    if (docs.length) {
      console.log('\nDocs that still talk about the "projects" example (not rewritten):');
      for (const { path, lines } of docs) console.log(`  ${path} (${lines.length} lines)`);
    }
  }
  console.log(checklist(slug, upstream));

  // Last step: remove every trace of this script. The package.json entry is
  // re-read from disk, not taken from the plan, so a failure above leaves the
  // script runnable.
  const written = JSON.parse(readFileSync(pkgPath, "utf8"));
  delete written.scripts.setup;
  writeFileSync(pkgPath, `${JSON.stringify(written, null, 2)}\n`);
  rmSync(join(ROOT, SELF));
  if (readdirSync(join(ROOT, "scripts")).length === 0) rmdirSync(join(ROOT, "scripts"));
  console.log("Setup finished and removed itself.");
}

main().catch((error) => {
  if (error instanceof SetupError) {
    console.error(`\nsetup: ${error.message}`);
    if (wroteFiles) {
      console.error(
        "\nFiles were already written. To start over (history is untouched):\n  git restore . && git clean -fd && rm .env",
      );
    }
  } else {
    console.error(error);
  }
  process.exit(1);
});
