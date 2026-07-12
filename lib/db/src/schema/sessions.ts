import { pgTable, varchar, timestamp, json } from "drizzle-orm/pg-core";

// Required by connect-pg-simple
export const sessionsTable = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: false }).notNull(),
});
