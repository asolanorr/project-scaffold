#!/usr/bin/env node
// PostToolUse hook for Edit/Write: run `biome check` on the one file that was
// just changed, so a lint or architecture-rule violation reaches the agent in
// the same turn instead of at `pnpm check`.
//
// Quiet on success (no output, exit 0). On a finding it prints Biome's report
// to stderr and exits 2, which Claude Code feeds back to the agent. Anything
// that is not a lintable file inside this repository is skipped, and a hook
// that cannot run (no node_modules yet) never blocks an edit.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LINTABLE = /\.(?:[cm]?[jt]sx?|json|jsonc|css)$/;

let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let file;
try {
  file = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof file !== "string" || !LINTABLE.test(file)) process.exit(0);

const path = resolve(root, file);
const inRepo = !relative(root, path).startsWith("..");
const biome = join(root, "node_modules/@biomejs/biome/bin/biome");
if (!inRepo || !existsSync(path) || !existsSync(biome)) process.exit(0);
// Plugin fixtures and generated output are not meant to pass.
if (/[/](?:node_modules|\.next|\.turbo|\.source)[/]/.test(path)) process.exit(0);

const result = spawnSync(process.execPath, [biome, "check", "--colors=off", path], {
  cwd: root,
  encoding: "utf8",
});
if (result.status === 0) process.exit(0);

process.stderr.write(
  `biome check failed for ${relative(root, path)}:\n${result.stdout}${result.stderr}`,
);
process.exit(2);
