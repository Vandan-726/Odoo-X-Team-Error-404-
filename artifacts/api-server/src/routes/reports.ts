import { Router } from "express";
import { db, assetsTable, assetAllocationsTable, maintenanceRequestsTable, resourceBookingsTable, activityLogsTable, transferRequestsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/reports/dashboard", requireAuth, async (req, res): Promise<void> => {
  const [
    totalResult,
    availableResult,
    allocatedResult,
    maintResult,
    bookingsResult,
    pendingTransfersResult,
    overdueResult,
    upcomingResult,
    recentActivity,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(assetsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.status, "available")),
    db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(eq(assetsTable.status, "allocated")),
    db.select({ count: sql<number>`count(*)::int` }).from(maintenanceRequestsTable).where(sql`DATE(${maintenanceRequestsTable.createdAt}) = CURRENT_DATE`),
    db.select({ count: sql<number>`count(*)::int` }).from(resourceBookingsTable).where(sql`${resourceBookingsTable.status} IN ('upcoming', 'ongoing')`),
    db.select({ count: sql<number>`count(*)::int` }).from(transferRequestsTable).where(eq(transferRequestsTable.status, "requested")),
    db.select({ count: sql<number>`count(*)::int` }).from(assetAllocationsTable).where(and(eq(assetAllocationsTable.status, "active"), sql`${assetAllocationsTable.expectedReturnDate} < CURRENT_DATE`)),
    db.select({ count: sql<number>`count(*)::int` }).from(assetAllocationsTable).where(and(eq(assetAllocationsTable.status, "active"), sql`${assetAllocationsTable.expectedReturnDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`)),
    db.select().from(activityLogsTable).orderBy(sql`${activityLogsTable.createdAt} DESC`).limit(10),
  ]);

  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map(u => [u.id, u.name]));

  res.json({
    totalAssets: totalResult[0]?.count ?? 0,
    availableAssets: availableResult[0]?.count ?? 0,
    allocatedAssets: allocatedResult[0]?.count ?? 0,
    maintenanceToday: maintResult[0]?.count ?? 0,
    activeBookings: bookingsResult[0]?.count ?? 0,
    pendingTransfers: pendingTransfersResult[0]?.count ?? 0,
    upcomingReturns: upcomingResult[0]?.count ?? 0,
    overdueCount: overdueResult[0]?.count ?? 0,
    recentActivity: recentActivity.map(a => ({
      id: a.id, userId: a.userId, userName: a.userId ? userMap.get(a.userId) ?? null : null,
      action: a.action, entityType: a.entityType, entityId: a.entityId,
      metadata: a.metadata, createdAt: a.createdAt.toISOString(), entryHash: a.entryHash ?? "",
    })),
  });
});

router.get("/reports/utilization", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT 
      COALESCE(ac.name, 'Uncategorized') as "categoryName",
      COUNT(a.id)::int as total,
      COUNT(CASE WHEN a.status = 'allocated' THEN 1 END)::int as allocated,
      COUNT(CASE WHEN a.status = 'available' THEN 1 END)::int as available,
      ROUND(
        COUNT(CASE WHEN a.status = 'allocated' THEN 1 END)::numeric / NULLIF(COUNT(a.id), 0) * 100, 1
      ) as "utilizationRate"
    FROM assets a
    LEFT JOIN asset_categories ac ON a.category_id = ac.id
    GROUP BY ac.name
    ORDER BY total DESC
  `);
  res.json(result.rows);
});

router.get("/reports/maintenance-frequency", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT 
      a.id as "assetId",
      a.name as "assetName",
      a.asset_tag as "assetTag",
      COUNT(mr.id)::int as "requestCount",
      MAX(mr.created_at)::text as "lastRequest"
    FROM assets a
    JOIN maintenance_requests mr ON mr.asset_id = a.id
    GROUP BY a.id, a.name, a.asset_tag
    ORDER BY "requestCount" DESC
    LIMIT 20
  `);
  res.json(result.rows);
});

router.get("/reports/idle-assets", requireAuth, async (_req, res): Promise<void> => {
  const assets = await db.select().from(assetsTable).where(eq(assetsTable.status, "available")).orderBy(assetsTable.name);
  res.json(assets.map(a => ({
    id: a.id, assetTag: a.assetTag, name: a.name,
    categoryId: a.categoryId, categoryName: null,
    serialNumber: a.serialNumber, acquisitionDate: a.acquisitionDate,
    acquisitionCost: a.acquisitionCost ? Number(a.acquisitionCost) : null,
    condition: a.condition, location: a.location, photoUrl: a.photoUrl,
    isBookable: a.isBookable, status: a.status, departmentId: a.departmentId, departmentName: null,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  })));
});

router.get("/reports/booking-heatmap", requireAuth, async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    SELECT 
      EXTRACT(DOW FROM start_time)::int as "dayOfWeek",
      EXTRACT(HOUR FROM start_time)::int as hour,
      COUNT(*)::int as count
    FROM resource_bookings
    WHERE status != 'cancelled'
    GROUP BY "dayOfWeek", hour
    ORDER BY "dayOfWeek", hour
  `);
  res.json(result.rows);
});

export default router;
