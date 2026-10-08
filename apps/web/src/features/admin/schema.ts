import { adminUpdateUserSchema } from "@repo/db/schema";
import { z } from "zod";

export const userIdSchema = z.object({ id: z.string().min(1) });

export const updateUserFormSchema = adminUpdateUserSchema.extend({ id: z.string().min(1) });

export const ADMIN_ERROR_KEYS = ["notFound"] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_KEYS)[number];
