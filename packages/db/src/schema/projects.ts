import { isNull } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { users } from "./auth";

export const projectStatus = pgEnum("project_status", ["draft", "active", "archived"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatus("status").notNull().default("draft"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // the list query filters by owner and status, and sorts by date
    index("projects_owner_status_idx").on(t.ownerId, t.status, t.createdAt),
    // partial: a deleted project must not block reusing its name
    uniqueIndex("projects_owner_name_uq").on(t.ownerId, t.name).where(isNull(t.deletedAt)),
  ],
);

// Allowlist with .pick(), never a denylist with .omit().
export const insertProjectSchema = createInsertSchema(projects, {
  name: (s) => s.min(2).max(120),
}).pick({ name: true, description: true, status: true });

export const updateProjectSchema = insertProjectSchema.partial();

export const selectProjectSchema = createSelectSchema(projects);

// The exact shape that may leave the server. Never a raw row.
export const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

export type NewProject = z.infer<typeof insertProjectSchema>;
export type Project = z.infer<typeof selectProjectSchema>;
/** What a query or action hands back: the row narrowed to `projectColumns`. */
export type ProjectView = Pick<Project, keyof typeof projectColumns>;
