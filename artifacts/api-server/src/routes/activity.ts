import { Router } from "express";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/activity-logs", requireAuth, async (req, res): Promise<void> => {
  const { entityType, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 100, 500);

  const logs = entityType && typeof entityType === "string"
    ? await db.select().from(activityLogsTable)
        .where(eq(activityLogsTable.entityType, entityType))
        .orderBy(sql`${activityLogsTable.createdAt} DESC`)
        .limit(maxLimit)
    : await db.select().from(activityLogsTable)
        .orderBy(sql`${activityLogsTable.createdAt} DESC`)
        .limit(maxLimit);

  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map(u => [u.id, u.name]));

  res.json(logs.map(a => ({
    id: a.id, userId: a.userId, userName: a.userId ? userMap.get(a.userId) ?? null : null,
    action: a.action, entityType: a.entityType, entityId: a.entityId,
    metadata: a.metadata, createdAt: a.createdAt.toISOString(), entryHash: a.entryHash ?? "",
  })));
});

export default router;
