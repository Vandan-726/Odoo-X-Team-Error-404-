import { Router } from "express";
import { db, transferRequestsTable, assetsTable, usersTable, assetAllocationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";
import { createNotification } from "../lib/notifications";

const router = Router();

async function formatTransfer(t: typeof transferRequestsTable.$inferSelect) {
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, t.assetId));
  const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, t.toEmployeeId));
  let fromUserName: string | null = null;
  if (t.fromEmployeeId) {
    const [fu] = await db.select().from(usersTable).where(eq(usersTable.id, t.fromEmployeeId));
    fromUserName = fu?.name ?? null;
  }
  return {
    id: t.id, assetId: t.assetId, assetName: asset?.name ?? null, assetTag: asset?.assetTag ?? null,
    fromEmployeeId: t.fromEmployeeId, fromEmployeeName: fromUserName,
    toEmployeeId: t.toEmployeeId, toEmployeeName: toUser?.name ?? null,
    reason: t.reason, status: t.status,
    requestedBy: t.requestedBy, approvedBy: t.approvedBy,
    requestedAt: t.requestedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
  };
}

router.get("/transfer-requests", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const { status } = req.query;
  const conditions = [];
  if (status && typeof status === "string") conditions.push(eq(transferRequestsTable.status, status));
  // Department heads only see transfers for assets in their own department
  if (sessionUser.role === "department_head" && sessionUser.departmentId) {
    conditions.push(sql`${transferRequestsTable.assetId} IN (SELECT id FROM assets WHERE department_id = ${sessionUser.departmentId})`);
  }

  const transfers = conditions.length
    ? await db.select().from(transferRequestsTable).where(and(...conditions)).orderBy(sql`${transferRequestsTable.requestedAt} DESC`)
    : await db.select().from(transferRequestsTable).orderBy(sql`${transferRequestsTable.requestedAt} DESC`);

  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json(transfers.map(t => {
    const asset = assetMap.get(t.assetId);
    const toUser = userMap.get(t.toEmployeeId);
    const fromUser = t.fromEmployeeId ? userMap.get(t.fromEmployeeId) : null;
    return {
      id: t.id, assetId: t.assetId, assetName: asset?.name ?? null, assetTag: asset?.assetTag ?? null,
      fromEmployeeId: t.fromEmployeeId, fromEmployeeName: fromUser?.name ?? null,
      toEmployeeId: t.toEmployeeId, toEmployeeName: toUser?.name ?? null,
      reason: t.reason, status: t.status,
      requestedBy: t.requestedBy, approvedBy: t.approvedBy,
      requestedAt: t.requestedAt.toISOString(),
      resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    };
  }));
});

router.post("/transfer-requests", requireAuth, async (req, res): Promise<void> => {
  const { assetId, toEmployeeId, reason } = req.body;
  if (!assetId || !toEmployeeId) {
    res.status(400).json({ error: "assetId and toEmployeeId are required" });
    return;
  }

  // Find current holder
  const [activeAlloc] = await db.select().from(assetAllocationsTable)
    .where(and(eq(assetAllocationsTable.assetId, assetId), eq(assetAllocationsTable.status, "active")));
  const fromEmployeeId = activeAlloc?.employeeId ?? null;

  const [tr] = await db.insert(transferRequestsTable).values({
    assetId, fromEmployeeId, toEmployeeId,
    reason: reason ?? null,
    requestedBy: req.session.user!.id,
    status: "requested",
  }).returning();

  await logActivity({ userId: req.session.user!.id, action: "request_transfer", entityType: "asset", entityId: assetId, metadata: { transferId: tr.id, toEmployeeId } });

  // Notify asset managers and relevant department head
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  const notifyRecipients = await db.select().from(usersTable).where(
    sql`${usersTable.role} IN ('asset_manager', 'admin') OR (${usersTable.role} = 'department_head' AND ${usersTable.departmentId} = ${asset?.departmentId ?? 0})`
  );
  await Promise.all(notifyRecipients.map(m => createNotification({
    userId: m.id, type: "transfer_request",
    message: `Transfer request for asset ${asset?.assetTag ?? assetId} needs approval`,
    referenceType: "transfer", referenceId: tr.id,
  })));

  res.status(201).json(await formatTransfer(tr));
});

router.patch("/transfer-requests/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const user = req.session.user!;

  // Only admin, asset_manager, and dept_head (scoped) may approve
  if (!["admin", "asset_manager", "department_head"].includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions to approve transfers" });
    return;
  }

  const [tr] = await db.select().from(transferRequestsTable).where(eq(transferRequestsTable.id, id));
  if (!tr || tr.status !== "requested") {
    res.status(404).json({ error: "Transfer request not found or not pending" });
    return;
  }

  // Department head: asset must belong to their department
  if (user.role === "department_head") {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, tr.assetId));
    if (asset?.departmentId !== user.departmentId) {
      res.status(403).json({ error: "You can only approve transfers for assets within your own department" });
      return;
    }
  }

  // Transaction: close current allocation, open new one, update transfer status
  await db.transaction(async (tx) => {
    await tx.update(assetAllocationsTable).set({ status: "returned", returnedAt: new Date() })
      .where(and(eq(assetAllocationsTable.assetId, tr.assetId), eq(assetAllocationsTable.status, "active")));
    await tx.insert(assetAllocationsTable).values({
      assetId: tr.assetId,
      employeeId: tr.toEmployeeId,
      createdBy: user.id,
      status: "active",
    });
    await tx.update(transferRequestsTable).set({
      status: "approved",
      approvedBy: user.id,
      resolvedAt: new Date(),
    }).where(eq(transferRequestsTable.id, id));
  });

  await logActivity({ userId: user.id, action: "approve_transfer", entityType: "asset", entityId: tr.assetId, metadata: { transferId: id } });
  await createNotification({ userId: tr.toEmployeeId, type: "transfer_approved", message: `Transfer request approved — asset is now yours`, referenceType: "transfer", referenceId: id });

  const [updated] = await db.select().from(transferRequestsTable).where(eq(transferRequestsTable.id, id));
  res.json(await formatTransfer(updated));
});

router.patch("/transfer-requests/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const user = req.session.user!;

  // Only admin, asset_manager, and dept_head (scoped) may reject
  if (!["admin", "asset_manager", "department_head"].includes(user.role)) {
    res.status(403).json({ error: "Insufficient permissions to reject transfers" });
    return;
  }

  // Department head: verify asset belongs to their department before rejecting
  if (user.role === "department_head") {
    const [tr] = await db.select().from(transferRequestsTable).where(eq(transferRequestsTable.id, id));
    if (!tr) {
      res.status(404).json({ error: "Transfer request not found" });
      return;
    }
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, tr.assetId));
    if (asset?.departmentId !== user.departmentId) {
      res.status(403).json({ error: "You can only reject transfers for assets within your own department" });
      return;
    }
  }

  const [updated] = await db.update(transferRequestsTable).set({
    status: "rejected",
    approvedBy: user.id,
    resolvedAt: new Date(),
  }).where(and(eq(transferRequestsTable.id, id), eq(transferRequestsTable.status, "requested"))).returning();

  if (!updated) {
    res.status(404).json({ error: "Transfer request not found or not pending" });
    return;
  }
  await logActivity({ userId: user.id, action: "reject_transfer", entityType: "asset", entityId: updated.assetId, metadata: { transferId: id } });

  res.json(await formatTransfer(updated));
});

export default router;
