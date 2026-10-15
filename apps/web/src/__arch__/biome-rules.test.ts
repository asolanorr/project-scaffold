import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Proof that the Biome rules (the Grit plugins in /biome-plugins) keep firing.
 *
 * Each fixture under ./fixtures is a small file with a header:
 *     // path: <where it pretends to live in the repo>
 *     // expect: <plugin id> | none
 * The test copies the real biome.json and the real plugins into a scratch
 * directory, writes every fixture at its pretend path (so the scoping in the
 * config's overrides is exercised too), runs Biome once, and checks that each
 * fixture got exactly the diagnostic it expects. If Biome is upgraded and a
 * pattern stops matching, or a plugin is unwired or scoped wrongly, this fails.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../..");
const FIXTURES = join(HERE, "fixtures");
const PLUGINS = join(REPO_ROOT, "biome-plugins");

interface Fixture {
  id: string;
  plugin: string;
  expect: string;
  virtualPath: string;
  body: string;
}

function loadFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const plugin of readdirSync(FIXTURES)) {
    for (const file of readdirSync(join(FIXTURES, plugin))) {
      const raw = readFileSync(join(FIXTURES, plugin, file), "utf8").replace(/\r\n/g, "\n");
      const [pathLine = "", expectLine = "", ...rest] = raw.split("\n");
      const virtualPath = /^\/\/ path: (.+)$/.exec(pathLine)?.[1];
      const expected = /^\/\/ expect: (.+)$/.exec(expectLine)?.[1];
      if (!virtualPath || !expected)
        throw new Error(`${plugin}/${file}: missing path/expect header`);
      out.push({
        id: `${plugin}.${basename(file, ".txt")}`,
        plugin,
        expect: expected.trim(),
        virtualPath: virtualPath.trim(),
        body: rest.join("\n"),
      });
    }
  }
  return out;
}

/** apps/web/src/a/x.test.ts + id -> apps/web/src/a/x.<id>.test.ts (extension and scope kept). */
function sandboxPath(fixture: Fixture): string {
  const dir = dirname(fixture.virtualPath);
  const name = basename(fixture.virtualPath);
  const dot = name.indexOf(".");
  return join(dir, `${name.slice(0, dot)}.${fixture.id}${name.slice(dot)}`);
}

interface Found {
  file: string;
  message: string;
}

let sandbox = "";
let found: Found[] = [];
let ranOk = false;
const fixtures = loadFixtures();

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "arch-biome-"));
  cpSync(PLUGINS, join(sandbox, "biome-plugins"), { recursive: true });

  // The real root config, with its `extends` pointed at a copy of the base config
  // and VCS integration off (the scratch directory is not a git checkout).
  mkdirSync(join(sandbox, "config"));
  cpSync(join(REPO_ROOT, "packages/config/biome.json"), join(sandbox, "config/biome.json"));
  const config = JSON.parse(readFileSync(join(REPO_ROOT, "biome.json"), "utf8"));
  config.extends = ["./config/biome.json"];
  config.vcs = { enabled: false };
  // The fixtures are written into the scratch tree, which must not be excluded there.
  config.files = { ...config.files, includes: ["**"] };
  writeFileSync(join(sandbox, "biome.json"), JSON.stringify(config, null, 2));

  for (const fixture of fixtures) {
    const target = join(sandbox, sandboxPath(fixture));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fixture.body);
  }

  const require = createRequire(join(REPO_ROOT, "package.json"));
  const biome = require.resolve("@biomejs/biome/bin/biome");
  const run = spawnSync(process.execPath, [biome, "lint", "--reporter=json", "."], {
    cwd: sandbox,
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
  // Biome exits 1 when it reports errors, which is the point; anything that did
  // not produce JSON is a real failure.
  const start = run.stdout.indexOf("{");
  if (start < 0) throw new Error(`Biome produced no report:\n${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout.slice(start)) as {
    diagnostics: Array<{ category: string; message: string; location?: { path?: string } }>;
  };
  found = report.diagnostics
    .filter((d) => d.category === "plugin")
    .map((d) => ({ file: (d.location?.path ?? "").replace(/\\/g, "/"), message: d.message }));
  ranOk = true;
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

describe("Biome plugin rules", () => {
  it("every plugin file has fixtures, and every fixture folder has a plugin", () => {
    const plugins = readdirSync(PLUGINS)
      .filter((file) => file.endsWith(".grit"))
      .map((file) => file.replace(/\.grit$/, ""))
      .sort();
    const folders = readdirSync(FIXTURES).sort();
    expect(folders).toEqual(plugins);
    for (const plugin of plugins) {
      const mine = fixtures.filter((fixture) => fixture.plugin === plugin);
      expect(
        mine.some((fixture) => fixture.expect === plugin),
        `${plugin} needs a fixture that expects it`,
      ).toBe(true);
      expect(
        mine.some((fixture) => fixture.expect === "none"),
        `${plugin} needs a fixture that must stay clean`,
      ).toBe(true);
    }
  });

  it("every plugin file is wired into biome.json", () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, "biome.json"), "utf8")) as {
      plugins?: string[];
      overrides?: Array<{ plugins?: string[] }>;
    };
    const wired = new Set([
      ...(config.plugins ?? []),
      ...(config.overrides ?? []).flatMap((override) => override.plugins ?? []),
    ]);
    for (const file of readdirSync(PLUGINS).filter((name) => name.endsWith(".grit"))) {
      expect(wired.has(`./biome-plugins/${file}`), `${file} is not referenced by biome.json`).toBe(
        true,
      );
    }
  });

  it("ran Biome on the fixtures", () => {
    expect(ranOk).toBe(true);
  });

  for (const fixture of fixtures) {
    it(`${fixture.id}: ${fixture.expect === "none" ? "stays clean" : `is flagged as ${fixture.expect}`}`, () => {
      const mine = found.filter((d) => d.file.endsWith(sandboxPath(fixture).replace(/\\/g, "/")));
      if (fixture.expect === "none") {
        expect(mine.map((d) => d.message)).toEqual([]);
      } else {
        expect(mine.length, `no plugin diagnostic for ${fixture.id}`).toBeGreaterThan(0);
        for (const d of mine) expect(d.message).toContain(`arch/${fixture.expect}:`);
      }
    });
  }
});
