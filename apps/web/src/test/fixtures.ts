import { db, users } from "@repo/db";

/**
 * Two accounts: the one the tests act as, and a bystander whose rows must
 * never be readable or writable from the first. Inserted inside the test
 * transaction, so they vanish with it.
 */
export const OWNER = { id: "u_owner", name: "Owner", email: "owner@example.test" };
export const OTHER = { id: "u_other", name: "Other", email: "other@example.test" };

export async function seedUsers(): Promise<void> {
  await db.insert(users).values([OWNER, OTHER]);
}

export function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** The session object `requireSession()` resolves to for a user. */
export function sessionFor(user: { id: string; email: string; name: string }) {
  return {
    session: { id: `s_${user.id}`, userId: user.id },
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/** Stand-in for Next's redirect(): throws, as the real one does. */
export class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}
