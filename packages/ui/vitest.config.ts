import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig says `jsx: preserve` for Next; the test runner has to compile it.
  esbuild: { jsx: "automatic" },
  test: {
    // Component tests render real React Aria; jsdom provides the DOM and
    // @testing-library/user-event drives the keyboard.
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
  resolve: {
    // The package imports itself by name, as the CLI-generated components do.
    alias: { "@repo/ui": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
