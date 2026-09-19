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

// Exported as an async function rather than an object so @repo/env can be
// imported after loadEnvConfig has run — a static import would be hoisted
// above it, and next.config cannot use top-level await.
export default async function config(): Promise<NextConfig> {
  const { deploymentOrigins } = await import("@repo/env");

  return withNextIntl(nextConfig(deploymentOrigins()));
}

const nextConfig = (origins: string[]): NextConfig => ({
  // Nothing is cached unless it says so. Reads opt in with "use cache" and a
  // tag; everything else renders per request. See ARCHITECTURE.md §6.
  cacheComponents: true,

  // Workspace packages ship TypeScript source rather than a build step, so Next
  // has to compile them itself.
  transpilePackages: ["@repo/auth", "@repo/db", "@repo/env", "@repo/ui"],

  typedRoutes: true,

  serverExternalPackages: ["postgres"],

  experimental: {
    // Next checks a Server Action's Origin against the request Host, and
    // otherwise against this list. Behind a custom domain or a proxy the two
    // differ, and without the real origin here every submission is rejected —
    // or, loosened instead, the check stops being a CSRF defense. The list is
    // the one Better Auth trusts too: the production domain (BETTER_AUTH_URL)
    // plus whatever Vercel serves this deployment on.
    serverActions: {
      allowedOrigins: origins.map((origin) => new URL(origin).host),
    },
  },
});
