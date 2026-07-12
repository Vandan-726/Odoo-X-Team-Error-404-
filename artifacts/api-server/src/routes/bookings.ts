import { Router } from "express";
import { db, resourceBookingsTable, assetsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

function formatBooking(b: typeof resourceBookingsTable.$inferSelect, assetName: string | null, bookedByName: string | null) {
  return {
    id: b.id, assetId: b.assetId, assetName,
    bookedBy: b.bookedBy, bookedByName,
    departmentId: b.departmentId, purpose: b.purpose,
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/bookings", requireAuth, async (req, res): Promise<void> => {
  const { assetId, date } = req.query;
  const conditions = [];
  if (assetId) conditions.push(eq(resourceBookingsTable.assetId, Number(assetId)));
  if (date && typeof date === "string") {
    // Filter bookings that overlap with the given date
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    conditions.push(sql`${resourceBookingsTable.startTime} <= ${dayEnd} AND ${resourceBookingsTable.endTime} >= ${dayStart}`);
  }

  const bookings = conditions.length
    ? await db.select().from(resourceBookingsTable).where(and(...conditions)).orderBy(resourceBookingsTable.startTime)
    : await db.select().from(resourceBookingsTable).orderBy(resourceBookingsTable.startTime);

  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const assetMap = new Map(assets.map(a => [a.id, a.name]));
  const userMap = new Map(users.map(u => [u.id, u.name]));

  res.json(bookings.map(b => formatBooking(b, assetMap.get(b.assetId) ?? null, userMap.get(b.bookedBy) ?? null)));
});

router.post("/bookings", requireAuth, async (req, res): Promise<void> => {
  const { assetId, departmentId, purpose, startTime, endTime } = req.body;
  if (!assetId || !startTime || !endTime) {
    res.status(400).json({ error: "assetId, startTime, and endTime are required" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) {
    res.status(400).json({ error: "endTime must be after startTime" });
    return;
  }

  // Check overlap: new.start < existing.end AND new.end > existing.start
  // A booking starting exactly when another ends is ALLOWED (new.start === existing.end)
  const conflicts = await db.select().from(resourceBookingsTable).where(
    and(
      eq(resourceBookingsTable.assetId, assetId),
      sql`${resourceBookingsTable.status} IN ('upcoming', 'ongoing')`,
      sql`${resourceBookingsTable.start_time} < ${end.toISOString()} AND ${resourceBookingsTable.end_time} > ${start.toISOString()}`
    )
  );

  if (conflicts.length > 0) {
    const assetDetails = await db.select().from(assetsTable);
    const userDetails = await db.select().from(usersTable);
    const assetMap = new Map(assetDetails.map(a => [a.id, a.name]));
    const userMap = new Map(userDetails.map(u => [u.id, u.name]));
    res.status(409).json({
      error: "Booking slot conflict",
      conflictingBookings: conflicts.map(b => formatBooking(b, assetMap.get(b.assetId) ?? null, userMap.get(b.bookedBy) ?? null)),
    });
    return;
  }

  const [booking] = await db.insert(resourceBookingsTable).values({
    assetId, bookedBy: req.session.user!.id,
    departmentId: departmentId ?? null,
    purpose: purpose ?? null,
    startTime: start,
    endTime: end,
    status: "upcoming",
  }).returning();

  await logActivity({ userId: req.session.user!.id, action: "create_booking", entityType: "booking", entityId: booking.id, metadata: { assetId, startTime, endTime } });

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user!.id));
  res.status(201).json(formatBooking(booking, asset?.name ?? null, user?.name ?? null));
});

router.patch("/bookings/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [updated] = await db.update(resourceBookingsTable).set({ status: "cancelled" })
    .where(and(eq(resourceBookingsTable.id, id), sql`${resourceBookingsTable.status} IN ('upcoming', 'ongoing')`))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Booking not found or cannot be cancelled" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "cancel_booking", entityType: "booking", entityId: id });

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, updated.assetId));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.bookedBy));
  res.json(formatBooking(updated, asset?.name ?? null, user?.name ?? null));
});

export default router;
