import { getIP } from "better-auth/api";
import { headers } from "next/headers";
import { auth } from "./auth";

export type RequestInfo = { ipAddress: string | null; userAgent: string | null };

/**
 * IP and user agent for the current request, for an audit entry written
 * from a Server Component or Server Action rather than from
 * `recordAuthEvent`'s Better Auth hook context.
 *
 * Reuses Better Auth's own `getIP` against the same resolved `auth.options`,
 * so this is governed by `advanced.ipAddress.trustedProxies` exactly the way
 * auth events are: with nothing configured, a multi-hop `X-Forwarded-For` is
 * discarded rather than believed, because every value in it can be set by
 * the client.
 */
export async function getRequestInfo(): Promise<RequestInfo> {
  const requestHeaders = await headers();
  return {
    ipAddress: getIP(requestHeaders, auth.options),
    userAgent: requestHeaders.get("user-agent"),
  };
}
