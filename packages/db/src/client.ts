import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false — the pooled connection runs through Supabase's pgbouncer
// in transaction mode, which does not support prepared statements.
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
