import { pgTable, serial, integer, varchar, jsonb, char, timestamp } from "drizzle-orm/pg-core";

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 60 }).notNull(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata").default({}),
  prevHash: char("prev_hash", { length: 64 }),
  entryHash: char("entry_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityLog = typeof activityLogsTable.$inferSelect;
