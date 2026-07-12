import { Router } from "express";
import { db, auditCyclesTable, auditCycleAuditorsTable, auditItemsTable, assetsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

async function formatCycleWithAuditors(c: typeof auditCyclesTable.$inferSelect) {
  const auditorRows = await db.select().from(auditCycleAuditorsTable).where(eq(auditCycleAuditorsTable.auditCycleId, c.id));
  const auditors = auditorRows.length > 0
    ? await db.select().from(usersTable).where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(auditorRows.map(a => sql`${a.auditorId}`), sql`, `)}])`)
    : [];
  return {
    id: c.id, name: c.name,
    scopeDepartmentId: c.scopeDepartmentId, scopeDepartmentName: null,
    scopeLocation: c.scopeLocation,
    startDate: c.startDate, endDate: c.endDate, status: c.status,
    createdBy: c.createdBy,
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    auditors: auditors.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, departmentId: u.departmentId, departmentName: null, status: u.status, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() })),
  };
}

router.get("/audit-cycles", requireAuth, async (_req, res): Promise<void> => {
  const cycles = await db.select().from(auditCyclesTable).orderBy(sql`${auditCyclesTable.id} DESC`);
  const results = await Promise.all(cycles.map(formatCycleWithAuditors));
  res.json(results);
});

router.post("/audit-cycles", requireAuth, async (req, res): Promise<void> => {
  const { name, scopeDepartmentId, scopeLocation, startDate, endDate, auditorIds, assetIds } = req.body;
  if (!name || !startDate || !endDate) {
    res.status(400).json({ error: "name, startDate, and endDate are required" });
    return;
  }

  const [cycle] = await db.insert(auditCyclesTable).values({
    name, scopeDepartmentId: scopeDepartmentId ?? null, scopeLocation: scopeLocation ?? null,
    startDate, endDate, createdBy: req.session.user!.id, status: "planned",
  }).returning();

  if (auditorIds?.length) {
    await db.insert(auditCycleAuditorsTable).values(auditorIds.map((uid: number) => ({ auditCycleId: cycle.id, auditorId: uid })));
  }

  // Add audit items
  let assetList = assetIds;
  if (!assetList?.length) {
    // If no assets specified, add all assets
    const all = await db.select().from(assetsTable);
    assetList = all.map((a: typeof assetsTable.$inferSelect) => a.id);
  }
  if (assetList.length > 0) {
    // Get locations for expected_location
    const assets = await db.select().from(assetsTable);
    const assetMap = new Map(assets.map((a: typeof assetsTable.$inferSelect) => [a.id, a]));
    await db.insert(auditItemsTable).values(assetList.map((aid: number) => ({
      auditCycleId: cycle.id, assetId: aid,
      expectedLocation: assetMap.get(aid)?.location ?? null,
      verificationStatus: "pending",
    })));
  }

  await logActivity({ userId: req.session.user!.id, action: "create_audit_cycle", entityType: "audit_cycle", entityId: cycle.id, metadata: { name } });
  res.status(201).json(await formatCycleWithAuditors(cycle));
});

router.get("/audit-cycles/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [cycle] = await db.select().from(auditCyclesTable).where(eq(auditCyclesTable.id, id));
  if (!cycle) {
    res.status(404).json({ error: "Audit cycle not found" });
    return;
  }

  const items = await db.select().from(auditItemsTable).where(eq(auditItemsTable.auditCycleId, id));
  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const userMap = new Map(users.map(u => [u.id, u]));

  const formattedItems = items.map(item => {
    const asset = assetMap.get(item.assetId);
    const verifier = item.verifiedBy ? userMap.get(item.verifiedBy) : null;
    return {
      id: item.id, auditCycleId: item.auditCycleId, assetId: item.assetId,
      assetName: asset?.name ?? null, assetTag: asset?.assetTag ?? null,
      expectedLocation: item.expectedLocation, verificationStatus: item.verificationStatus,
      notes: item.notes, verifiedBy: item.verifiedBy, verifiedByName: verifier?.name ?? null,
      verifiedAt: item.verifiedAt ? item.verifiedAt.toISOString() : null,
    };
  });

  const summary = {
    total: items.length,
    verified: items.filter(i => i.verificationStatus === "verified").length,
    missing: items.filter(i => i.verificationStatus === "missing").length,
    damaged: items.filter(i => i.verificationStatus === "damaged").length,
    pending: items.filter(i => i.verificationStatus === "pending").length,
  };

  const base = await formatCycleWithAuditors(cycle);
  res.json({ ...base, items: formattedItems, summary });
});

router.post("/audit-cycles/:id/items/:itemId/verify", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawItemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  const itemId = parseInt(rawItemId, 10);
  const { verificationStatus, notes } = req.body;
  const validStatuses = ["pending", "verified", "missing", "damaged"];
  if (!validStatuses.includes(verificationStatus)) {
    res.status(400).json({ error: "Invalid verification status" });
    return;
  }

  const [updated] = await db.update(auditItemsTable).set({
    verificationStatus, notes: notes ?? null,
    verifiedBy: req.session.user!.id, verifiedAt: new Date(),
  }).where(eq(auditItemsTable.id, itemId)).returning();

  if (!updated) {
    res.status(404).json({ error: "Audit item not found" });
    return;
  }

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, updated.assetId));
  const [verifier] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user!.id));
  res.json({
    id: updated.id, auditCycleId: updated.auditCycleId, assetId: updated.assetId,
    assetName: asset?.name ?? null, assetTag: asset?.assetTag ?? null,
    expectedLocation: updated.expectedLocation, verificationStatus: updated.verificationStatus,
    notes: updated.notes, verifiedBy: updated.verifiedBy, verifiedByName: verifier?.name ?? null,
    verifiedAt: updated.verifiedAt ? updated.verifiedAt.toISOString() : null,
  });
});

router.post("/audit-cycles/:id/close", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [cycle] = await db.select().from(auditCyclesTable).where(eq(auditCyclesTable.id, id));
  if (!cycle || cycle.status === "closed") {
    res.status(400).json({ error: "Audit cycle not found or already closed" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(auditCyclesTable).set({ status: "closed", closedAt: new Date() }).where(eq(auditCyclesTable.id, id));
    // Mark missing items' assets as lost
    const missingItems = await tx.select().from(auditItemsTable)
      .where(sql`${auditItemsTable.auditCycleId} = ${id} AND ${auditItemsTable.verificationStatus} = 'missing'`);
    for (const item of missingItems) {
      await tx.update(assetsTable).set({ status: "lost", updatedAt: new Date() }).where(eq(assetsTable.id, item.assetId));
    }
  });

  await logActivity({ userId: req.session.user!.id, action: "close_audit_cycle", entityType: "audit_cycle", entityId: id });
  const [updated] = await db.select().from(auditCyclesTable).where(eq(auditCyclesTable.id, id));
  res.json(await formatCycleWithAuditors(updated));
});

export default router;
