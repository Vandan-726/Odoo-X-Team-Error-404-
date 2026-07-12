import { pgTable, serial, integer, date, timestamp, text, varchar } from "drizzle-orm/pg-core";

export const assetAllocationsTable = pgTable("asset_allocations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  departmentId: integer("department_id"),
  allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
  expectedReturnDate: date("expected_return_date", { mode: "string" }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnConditionNotes: text("return_condition_notes"),
  status: varchar("status", { length: 15 }).notNull().default("active"),
  createdBy: integer("created_by"),
});

export type AssetAllocation = typeof assetAllocationsTable.$inferSelect;
