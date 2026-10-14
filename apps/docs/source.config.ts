import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "fumadocs-mdx/config";
import { REMOVABLE_SOURCES, UPSTREAM_REPO } from "./upstream";

const INCLUDE = /^<include\b[^>]*>([^<\n]*)<\/include>$/gm;

/** The directory holding pnpm-workspace.yaml, found from the page being compiled. */
function repoRoot(from: string): string {
  let dir = from;
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
  return dir;
}

export default defineConfig({
  plugins: [
    {
      name: "tolerate-removed-example-sources",
      doc: {
        // Runs before remark-include, which throws on a missing file. An include
        // of a source the example feature owned, now deleted, becomes a note.
        vfile(file) {
          const dir = file.dirname;
          if (!dir) return;
          const root = repoRoot(dir);
          file.value = String(file.value).replace(INCLUDE, (whole, target: string) => {
            // MDX escapes `_` in paths as `\_`.
            const absolute = path.resolve(dir, target.split("#")[0].replaceAll("_", "_"));
            if (existsSync(absolute)) return whole;
            const repoPath = path.relative(root, absolute).split(path.sep).join("/");
            if (!REMOVABLE_SOURCES.some((source) => repoPath.startsWith(source))) return whole;
            const href = encodeURI(repoPath).replaceAll("(", "%28").replaceAll(")", "%29");
            return `> The example source for this snippet, \`${repoPath}\`, is not part of this project. [Read it in the scaffold repo](${UPSTREAM_REPO}/blob/main/${href}).`;
          });
          return file;
        },
      },
    },
  ],
});
