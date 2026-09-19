import { createGetUrl } from "fumadocs-core/source";

export const appName = "Scaffold";
export const docsRoute = "/docs";
export const docsContentRoute = "/llms.mdx/docs";

/**
 * Where the source lives, for "view on GitHub" links. Read from the
 * environment so a fork points at itself; unset means no link is rendered.
 */
export const repoUrl = process.env.NEXT_PUBLIC_REPO_URL;

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
}
