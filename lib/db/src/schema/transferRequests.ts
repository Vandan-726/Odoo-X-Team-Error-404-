import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const transferRequestsTable = pgTable("transfer_requests", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  fromEmployeeId: integer("from_employee_id"),
  toEmployeeId: integer("to_employee_id").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 15 }).notNull().default("requested"),
  requestedBy: integer("requested_by"),
  approvedBy: integer("approved_by"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type TransferRequest = typeof transferRequestsTable.$inferSelect;
