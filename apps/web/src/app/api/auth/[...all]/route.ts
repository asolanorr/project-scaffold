import { authRouteHandlers } from "@repo/auth";

// The one route handler in the application. Handlers exist for webhooks and for
// third-party-facing endpoints only; this is Better Auth's own surface, which
// performs its own origin check and rate limiting rather than relying on Next's
// Server Action CSRF protection.
//
// It sits outside [locale] on purpose: these are API endpoints, not pages, and
// the middleware matcher excludes /api so nothing here gets locale-rewritten.
export const { GET, POST } = authRouteHandlers;
