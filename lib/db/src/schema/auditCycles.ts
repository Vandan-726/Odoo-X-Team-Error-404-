import { pgTable, serial, integer, varchar, date, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const auditCyclesTable = pgTable("audit_cycles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  scopeDepartmentId: integer("scope_department_id"),
  scopeLocation: varchar("scope_location", { length: 120 }),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: varchar("status", { length: 15 }).notNull().default("planned"),
  createdBy: integer("created_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const auditCycleAuditorsTable = pgTable("audit_cycle_auditors", {
  auditCycleId: integer("audit_cycle_id").notNull(),
  auditorId: integer("auditor_id").notNull(),
}, (t) => [primaryKey({ columns: [t.auditCycleId, t.auditorId] })]);

export const auditItemsTable = pgTable("audit_items", {
  id: serial("id").primaryKey(),
  auditCycleId: integer("audit_cycle_id").notNull(),
  assetId: integer("asset_id").notNull(),
  expectedLocation: varchar("expected_location", { length: 120 }),
  verificationStatus: varchar("verification_status", { length: 15 }).notNull().default("pending"),
  notes: varchar("notes", { length: 500 }),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export type AuditCycle = typeof auditCyclesTable.$inferSelect;
export type AuditCycleAuditor = typeof auditCycleAuditorsTable.$inferSelect;
export type AuditItem = typeof auditItemsTable.$inferSelect;
