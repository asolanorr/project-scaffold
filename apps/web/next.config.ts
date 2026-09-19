import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// One .env at the repository root, shared by the app, drizzle-kit and the
// scripts. Next only looks in the app directory, so it is pointed at the root
// here — before @repo/env is imported anywhere, since that validates on import
// and would otherwise fail the build with everything unset. Only affects local
// development; a deployment supplies real environment variables.
loadEnvConfig(fileURLToPath(new URL("../..", import.meta.url)));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Nothing is cached unless it says so. Reads opt in with "use cache" and a
  // tag; everything else renders per request. See ARCHITECTURE.md §6.
  cacheComponents: true,

  // Workspace packages ship TypeScript source rather than a build step, so Next
  // has to compile them itself.
  transpilePackages: ["@repo/auth", "@repo/db", "@repo/env", "@repo/ui"],

  typedRoutes: true,

  serverExternalPackages: ["postgres"],

  experimental: {
    // Behind a custom domain or a proxy this has to list the real origin, or
    // the Server Action origin check either rejects every submission or, if
    // loosened instead, stops being a CSRF defense. Empty is correct only while
    // the app is served from the origin it thinks it is.
    serverActions: { allowedOrigins: [] },
  },
};

export default withNextIntl(nextConfig);
