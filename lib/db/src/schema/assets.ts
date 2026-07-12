import { pgTable, serial, varchar, integer, date, numeric, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  assetTag: varchar("asset_tag", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  categoryId: integer("category_id"),
  serialNumber: varchar("serial_number", { length: 100 }),
  acquisitionDate: date("acquisition_date", { mode: "string" }),
  acquisitionCost: numeric("acquisition_cost", { precision: 12, scale: 2 }),
  condition: varchar("condition", { length: 20 }).default("good"),
  location: varchar("location", { length: 120 }),
  photoUrl: text("photo_url"),
  isBookable: boolean("is_bookable").default(false),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  departmentId: integer("department_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
