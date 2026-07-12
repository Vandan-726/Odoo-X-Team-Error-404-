import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const maintenanceRequestsTable = pgTable("maintenance_requests", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  raisedBy: integer("raised_by").notNull(),
  issueDescription: text("issue_description").notNull(),
  priority: varchar("priority", { length: 10 }).notNull().default("medium"),
  photoUrl: text("photo_url"),
  status: varchar("status", { length: 25 }).notNull().default("pending"),
  assignedTechnician: varchar("assigned_technician", { length: 120 }),
  approvedBy: integer("approved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MaintenanceRequest = typeof maintenanceRequestsTable.$inferSelect;
