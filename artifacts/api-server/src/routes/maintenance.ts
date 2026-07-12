import { Router } from "express";
import { db, maintenanceRequestsTable, assetsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";
import { createNotification } from "../lib/notifications";

const router = Router();

function formatMaint(m: typeof maintenanceRequestsTable.$inferSelect, assetName: string | null, assetTag: string | null, raisedByName: string | null) {
  return {
    id: m.id, assetId: m.assetId, assetName, assetTag,
    raisedBy: m.raisedBy, raisedByName,
    issueDescription: m.issueDescription,
    priority: m.priority, photoUrl: m.photoUrl,
    status: m.status, assignedTechnician: m.assignedTechnician,
    approvedBy: m.approvedBy,
    resolvedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(),
  };
}

async function getWithDetails(id: number) {
  const [m] = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.id, id));
  if (!m) return null;
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, m.assetId));
  const [raiser] = await db.select().from(usersTable).where(eq(usersTable.id, m.raisedBy));
  return formatMaint(m, asset?.name ?? null, asset?.assetTag ?? null, raiser?.name ?? null);
}

router.get("/maintenance-requests", requireAuth, async (req, res): Promise<void> => {
  const { status } = req.query;
  const reqs = status && typeof status === "string"
    ? await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.status, status)).orderBy(sql`${maintenanceRequestsTable.createdAt} DESC`)
    : await db.select().from(maintenanceRequestsTable).orderBy(sql`${maintenanceRequestsTable.createdAt} DESC`);

  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json(reqs.map(m => {
    const asset = assetMap.get(m.assetId);
    const raiser = userMap.get(m.raisedBy);
    return formatMaint(m, asset?.name ?? null, asset?.assetTag ?? null, raiser?.name ?? null);
  }));
});

router.post("/maintenance-requests", requireAuth, async (req, res): Promise<void> => {
  const { assetId, issueDescription, priority, photoUrl } = req.body;
  if (!assetId || !issueDescription || !priority) {
    res.status(400).json({ error: "assetId, issueDescription, and priority are required" });
    return;
  }
  const [m] = await db.insert(maintenanceRequestsTable).values({
    assetId, raisedBy: req.session.user!.id,
    issueDescription, priority,
    photoUrl: photoUrl ?? null,
  }).returning();

  await logActivity({ userId: req.session.user!.id, action: "raise_maintenance", entityType: "maintenance", entityId: m.id, metadata: { assetId, priority } });
  const managers = await db.select().from(usersTable).where(eq(usersTable.role, "asset_manager"));
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  await Promise.all(managers.map(mg => createNotification({ userId: mg.id, type: "maintenance_request", message: `Maintenance request for ${asset?.assetTag ?? assetId}: ${priority} priority`, referenceType: "maintenance", referenceId: m.id })));

  res.status(201).json(await getWithDetails(m.id));
});

router.patch("/maintenance-requests/:id/approve", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [m] = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.id, id));
  if (!m || m.status !== "pending") {
    res.status(400).json({ error: "Request not found or not in pending state" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(maintenanceRequestsTable).set({ status: "approved", approvedBy: req.session.user!.id, updatedAt: new Date() }).where(eq(maintenanceRequestsTable.id, id));
    await tx.update(assetsTable).set({ status: "under_maintenance", updatedAt: new Date() }).where(eq(assetsTable.id, m.assetId));
  });

  await logActivity({ userId: req.session.user!.id, action: "approve_maintenance", entityType: "maintenance", entityId: id });
  await createNotification({ userId: m.raisedBy, type: "maintenance_approved", message: `Your maintenance request has been approved`, referenceType: "maintenance", referenceId: id });
  res.json(await getWithDetails(id));
});

router.patch("/maintenance-requests/:id/reject", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [m] = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.id, id));
  if (!m || m.status !== "pending") {
    res.status(400).json({ error: "Request not found or not in pending state" });
    return;
  }
  await db.update(maintenanceRequestsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(maintenanceRequestsTable.id, id));
  await logActivity({ userId: req.session.user!.id, action: "reject_maintenance", entityType: "maintenance", entityId: id });
  res.json(await getWithDetails(id));
});

router.patch("/maintenance-requests/:id/assign-technician", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { assignedTechnician } = req.body;
  if (!assignedTechnician) {
    res.status(400).json({ error: "assignedTechnician is required" });
    return;
  }
  const [m] = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.id, id));
  if (!m || m.status !== "approved") {
    res.status(400).json({ error: "Request must be in approved state" });
    return;
  }
  await db.update(maintenanceRequestsTable).set({ status: "technician_assigned", assignedTechnician, updatedAt: new Date() }).where(eq(maintenanceRequestsTable.id, id));
  await logActivity({ userId: req.session.user!.id, action: "assign_technician", entityType: "maintenance", entityId: id, metadata: { assignedTechnician } });
  res.json(await getWithDetails(id));
});

router.patch("/maintenance-requests/:id/resolve", requireAuth, requireRole("admin", "asset_manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [m] = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.id, id));
  if (!m || !["technician_assigned", "in_progress", "approved"].includes(m.status)) {
    res.status(400).json({ error: "Request cannot be resolved from its current state" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(maintenanceRequestsTable).set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(maintenanceRequestsTable.id, id));
    await tx.update(assetsTable).set({ status: "available", updatedAt: new Date() }).where(eq(assetsTable.id, m.assetId));
  });

  await logActivity({ userId: req.session.user!.id, action: "resolve_maintenance", entityType: "maintenance", entityId: id });
  await createNotification({ userId: m.raisedBy, type: "maintenance_resolved", message: `Maintenance request resolved — asset is available again`, referenceType: "maintenance", referenceId: id });
  res.json(await getWithDetails(id));
});

export default router;
