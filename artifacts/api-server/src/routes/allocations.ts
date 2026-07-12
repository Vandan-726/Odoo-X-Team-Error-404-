import { Router } from "express";
import { db, assetsTable, assetAllocationsTable, usersTable, departmentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";
import { createNotification } from "../lib/notifications";

const router = Router();

async function formatAllocation(a: typeof assetAllocationsTable.$inferSelect) {
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, a.assetId));
  const [emp] = await db.select().from(usersTable).where(eq(usersTable.id, a.employeeId));
  let deptName: string | null = null;
  if (a.departmentId) {
    const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, a.departmentId));
    deptName = d?.name ?? null;
  }
  const now = new Date();
  const isOverdue = a.status === "active" && a.expectedReturnDate !== null && new Date(a.expectedReturnDate) < now;
  return {
    id: a.id, assetId: a.assetId, assetTag: asset?.assetTag ?? null, assetName: asset?.name ?? null,
    employeeId: a.employeeId, employeeName: emp?.name ?? null,
    departmentId: a.departmentId, departmentName: deptName,
    allocatedAt: a.allocatedAt.toISOString(),
    expectedReturnDate: a.expectedReturnDate,
    returnedAt: a.returnedAt ? a.returnedAt.toISOString() : null,
    returnConditionNotes: a.returnConditionNotes,
    status: a.status, isOverdue,
  };
}

router.get("/allocations", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const { assetId, employeeId, status } = req.query;
  const conditions = [];
  if (assetId) conditions.push(eq(assetAllocationsTable.assetId, Number(assetId)));
  if (employeeId) conditions.push(eq(assetAllocationsTable.employeeId, Number(employeeId)));
  if (status && typeof status === "string") conditions.push(eq(assetAllocationsTable.status, status));
  // Department heads only see allocations for assets in their own department
  if (sessionUser.role === "department_head" && sessionUser.departmentId) {
    conditions.push(sql`${assetAllocationsTable.assetId} IN (SELECT id FROM assets WHERE department_id = ${sessionUser.departmentId})`);
  }

  const allocs = conditions.length
    ? await db.select().from(assetAllocationsTable).where(and(...conditions)).orderBy(sql`${assetAllocationsTable.allocatedAt} DESC`)
    : await db.select().from(assetAllocationsTable).orderBy(sql`${assetAllocationsTable.allocatedAt} DESC`);

  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const depts = await db.select().from(departmentsTable);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const deptMap = new Map(depts.map(d => [d.id, d.name]));
  const now = new Date();

  res.json(allocs.map(a => {
    const asset = assetMap.get(a.assetId);
    const emp = userMap.get(a.employeeId);
    const isOverdue = a.status === "active" && a.expectedReturnDate !== null && new Date(a.expectedReturnDate) < now;
    return {
      id: a.id, assetId: a.assetId, assetTag: asset?.assetTag ?? null, assetName: asset?.name ?? null,
      employeeId: a.employeeId, employeeName: emp?.name ?? null,
      departmentId: a.departmentId, departmentName: a.departmentId ? deptMap.get(a.departmentId) ?? null : null,
      allocatedAt: a.allocatedAt.toISOString(),
      expectedReturnDate: a.expectedReturnDate,
      returnedAt: a.returnedAt ? a.returnedAt.toISOString() : null,
      returnConditionNotes: a.returnConditionNotes,
      status: a.status, isOverdue,
    };
  }));
});

router.get("/allocations/overdue", requireAuth, async (_req, res): Promise<void> => {
  const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const allocs = await db.select().from(assetAllocationsTable)
    .where(and(eq(assetAllocationsTable.status, "active"), sql`${assetAllocationsTable.expectedReturnDate} < ${now}`))
    .orderBy(sql`${assetAllocationsTable.expectedReturnDate} ASC`);

  const assets = await db.select().from(assetsTable);
  const users = await db.select().from(usersTable);
  const depts = await db.select().from(departmentsTable);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  res.json(allocs.map(a => {
    const asset = assetMap.get(a.assetId);
    const emp = userMap.get(a.employeeId);
    return {
      id: a.id, assetId: a.assetId, assetTag: asset?.assetTag ?? null, assetName: asset?.name ?? null,
      employeeId: a.employeeId, employeeName: emp?.name ?? null,
      departmentId: a.departmentId, departmentName: a.departmentId ? deptMap.get(a.departmentId) ?? null : null,
      allocatedAt: a.allocatedAt.toISOString(),
      expectedReturnDate: a.expectedReturnDate,
      returnedAt: null, returnConditionNotes: null,
      status: a.status, isOverdue: true,
    };
  }));
});

router.post("/allocations", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  // Only admin, asset_manager, and department_head may allocate assets
  if (!["admin", "asset_manager", "department_head"].includes(sessionUser.role)) {
    res.status(403).json({ error: "Insufficient permissions to allocate assets" });
    return;
  }

  const { assetId, employeeId, departmentId, expectedReturnDate } = req.body;
  if (!assetId || !employeeId) {
    res.status(400).json({ error: "assetId and employeeId are required" });
    return;
  }

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, assetId));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  // Department head: enforce department-scoping on both asset and recipient
  if (sessionUser.role === "department_head") {
    if (!sessionUser.departmentId) {
      res.status(403).json({ error: "Department head has no department assigned" });
      return;
    }
    if (asset.departmentId !== sessionUser.departmentId) {
      res.status(403).json({ error: "You can only allocate assets within your own department" });
      return;
    }
    const [emp] = await db.select().from(usersTable).where(eq(usersTable.id, employeeId));
    if (!emp || emp.departmentId !== sessionUser.departmentId) {
      res.status(403).json({ error: "You can only allocate assets within your own department" });
      return;
    }
  }

  if (asset.status !== "available") {
    // Find current holder
    const [activeAlloc] = await db.select().from(assetAllocationsTable)
      .where(and(eq(assetAllocationsTable.assetId, assetId), eq(assetAllocationsTable.status, "active")));
    let holderName = "Unknown";
    let holderDept: string | null = null;
    if (activeAlloc) {
      const [holder] = await db.select().from(usersTable).where(eq(usersTable.id, activeAlloc.employeeId));
      holderName = holder?.name ?? "Unknown";
      if (holder?.departmentId) {
        const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, holder.departmentId));
        holderDept = d?.name ?? null;
      }
    }
    res.status(409).json({
      error: `Asset is currently ${asset.status}`,
      currentHolderName: holderName,
      currentHolderDepartment: holderDept,
      allocationId: activeAlloc?.id ?? 0,
    });
    return;
  }

  // For department heads, always tag the allocation to their own department
  const effectiveDeptId = (sessionUser.role === "department_head" && sessionUser.departmentId)
    ? sessionUser.departmentId
    : (departmentId ?? null);

  const [alloc] = await db.insert(assetAllocationsTable).values({
    assetId,
    employeeId,
    departmentId: effectiveDeptId,
    expectedReturnDate: expectedReturnDate ?? null,
    createdBy: sessionUser.id,
  }).returning();

  await db.update(assetsTable).set({ status: "allocated", updatedAt: new Date() }).where(eq(assetsTable.id, assetId));

  await logActivity({ userId: req.session.user!.id, action: "allocate", entityType: "asset", entityId: assetId, metadata: { employeeId, allocationId: alloc.id } });
  await createNotification({ userId: employeeId, type: "allocation", message: `Asset ${asset.assetTag} (${asset.name}) has been allocated to you`, referenceType: "allocation", referenceId: alloc.id });

  const result = await formatAllocation(alloc);
  res.status(201).json(result);
});

router.post("/allocations/:id/return", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { returnConditionNotes } = req.body;

  const [alloc] = await db.select().from(assetAllocationsTable).where(eq(assetAllocationsTable.id, id));
  if (!alloc) {
    res.status(404).json({ error: "Allocation not found" });
    return;
  }
  if (alloc.status !== "active") {
    res.status(400).json({ error: "Allocation is not active" });
    return;
  }

  const [updated] = await db.update(assetAllocationsTable).set({
    status: "returned",
    returnedAt: new Date(),
    returnConditionNotes: returnConditionNotes ?? null,
  }).where(eq(assetAllocationsTable.id, id)).returning();

  await db.update(assetsTable).set({ status: "available", updatedAt: new Date() }).where(eq(assetsTable.id, alloc.assetId));

  await logActivity({ userId: req.session.user!.id, action: "return", entityType: "asset", entityId: alloc.assetId, metadata: { allocationId: id } });

  res.json({
    id: updated.id, assetId: updated.assetId, employeeId: updated.employeeId,
    departmentId: updated.departmentId, allocatedAt: updated.allocatedAt.toISOString(),
    expectedReturnDate: updated.expectedReturnDate,
    returnedAt: updated.returnedAt ? updated.returnedAt.toISOString() : null,
    returnConditionNotes: updated.returnConditionNotes,
    status: updated.status, createdBy: updated.createdBy,
  });
});

export default router;
