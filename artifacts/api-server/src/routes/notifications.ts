import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

function formatNotif(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id, userId: n.userId, type: n.type, message: n.message,
    referenceType: n.referenceType, referenceId: n.referenceId,
    isRead: n.isRead, createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.user!.id;
  const { filter } = req.query;
  const conditions = [eq(notificationsTable.userId, userId)];
  if (filter && typeof filter === "string" && filter !== "all") {
    // Filter by type prefix
    conditions.push(sql`${notificationsTable.type} LIKE ${filter + "%"}`);
  }
  const notifs = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(sql`${notificationsTable.createdAt} DESC`)
    .limit(100);
  res.json(notifs.map(formatNotif));
});

router.patch("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, req.session.user!.id), eq(notificationsTable.isRead, false)));
  res.json({ success: true });
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.session.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(formatNotif(updated));
});

export default router;
