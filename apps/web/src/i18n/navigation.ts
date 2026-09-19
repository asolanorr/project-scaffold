import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const navigation = createNavigation(routing);

// Use these, never bare next/link or next/navigation, or the locale prefix is
// dropped the moment a Spanish user follows a link.
export const Link = navigation.Link;
export const usePathname = navigation.usePathname;
export const useRouter = navigation.useRouter;
export const getPathname = navigation.getPathname;

// Explicitly annotated rather than destructured. `redirect` returns `never`,
// but TypeScript only treats a call as terminating when the callee's
// declaration carries an explicit type annotation — without this, every action
// that ends in a redirect reports "lacks ending return statement".
export const redirect: typeof navigation.redirect = navigation.redirect;
