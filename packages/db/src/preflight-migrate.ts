import "@repo/env/load";
import postgres from "postgres";

/**
 * Runs before `drizzle-kit migrate` in the `db:migrate` script.
 *
 * `drizzle-kit migrate` fails on a closed connection with nothing but a
 * spinner and exit code 1 — the actual error never reaches the terminal, so
 * "it didn't work" is the only information a reader following the README's
 * quick start gets. This repeats the same connection drizzle-kit is about to
 * attempt, using the same driver, so the one error it swallows is the one
 * error this prints — alongside what to do about it, not instead of it.
 */
async function main(): Promise<void> {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error(
      "DIRECT_URL is not set. Copy .env.example to .env and fill it in — see README.md.",
    );
    process.exit(1);
  }

  const { hostname, port } = new URL(url);
  const client = postgres(url, { max: 1, connect_timeout: 5 });

  try {
    await client`select 1`;
  } catch (error) {
    console.error(
      [
        `Could not reach Postgres at ${hostname}:${port || "5432"}.`,
        "",
        'Start it first — see README.md\'s "Database option A" (Supabase CLI) or',
        '"Database option B" (plain Postgres in Docker):',
        "  pnpm dlx supabase start      # option A, if already initialised",
        "  docker start scaffold-pg     # option B, if the container already exists",
        "",
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
    process.exit(1);
  } finally {
    await client.end({ timeout: 1 });
  }
}

await main();
