import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

export const resourceBookingsTable = pgTable("resource_bookings", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  bookedBy: integer("booked_by").notNull(),
  departmentId: integer("department_id"),
  purpose: varchar("purpose", { length: 200 }),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 15 }).notNull().default("upcoming"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResourceBooking = typeof resourceBookingsTable.$inferSelect;
