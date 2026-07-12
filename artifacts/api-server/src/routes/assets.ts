import { Router } from "express";
import { db, assetsTable, assetCategoriesTable, departmentsTable, assetAllocationsTable, maintenanceRequestsTable, usersTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

function formatAsset(
  asset: typeof assetsTable.$inferSelect,
  categoryName: string | null,
  deptName: string | null
) {
  return {
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    categoryId: asset.categoryId,
    categoryName,
    serialNumber: asset.serialNumber,
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost ? Number(asset.acquisitionCost) : null,
    condition: asset.condition,
    location: asset.location,
    photoUrl: asset.photoUrl,
    isBookable: asset.isBookable,
    status: asset.status,
    departmentId: asset.departmentId,
    departmentName: deptName,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

router.get("/assets", requireAuth, async (req, res): Promise<void> => {
  const { search, status, category, department } = req.query;
  const conditions = [];
  if (status && typeof status === "string") conditions.push(eq(assetsTable.status, status));
  if (category) conditions.push(eq(assetsTable.categoryId, Number(category)));
  if (department) conditions.push(eq(assetsTable.departmentId, Number(department)));
  if (search && typeof search === "string") {
    conditions.push(or(
      ilike(assetsTable.name, `%${search}%`),
      ilike(assetsTable.assetTag, `%${search}%`),
    ));
  }

  const assets = conditions.length
    ? await db.select().from(assetsTable).where(and(...conditions)).orderBy(assetsTable.name)
    : await db.select().from(assetsTable).orderBy(assetsTable.name);

  const [cats, depts] = await Promise.all([
    db.select().from(assetCategoriesTable),
    db.select().from(departmentsTable),
  ]);
  const catMap = new Map(cats.map(c => [c.id, c.name]));
  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  res.json(assets.map(a => formatAsset(a, a.categoryId ? catMap.get(a.categoryId) ?? null : null, a.departmentId ? deptMap.get(a.departmentId) ?? null : null)));
});

router.post("/assets", requireAuth, async (req, res): Promise<void> => {
  const user = req.session.user!;
  if (!["admin", "asset_manager"].includes(user.role)) {
    res.status(403).json({ error: "Only admins and asset managers can register assets" });
    return;
  }
  const { assetTag, name, categoryId, serialNumber, acquisitionDate, acquisitionCost, condition, location, photoUrl, isBookable, status, departmentId } = req.body;
  if (!assetTag || !name) {
    res.status(400).json({ error: "assetTag and name are required" });
    return;
  }
  const [asset] = await db.insert(assetsTable).values({
    assetTag,
    name,
    categoryId: categoryId ?? null,
    serialNumber: serialNumber ?? null,
    acquisitionDate: acquisitionDate ?? null,
    acquisitionCost: acquisitionCost ?? null,
    condition: condition ?? "good",
    location: location ?? null,
    photoUrl: photoUrl ?? null,
    isBookable: isBookable ?? false,
    status: status ?? "available",
    departmentId: departmentId ?? null,
  }).returning();

  await logActivity({ userId: user.id, action: "create", entityType: "asset", entityId: asset.id, metadata: { assetTag, name } });
  res.status(201).json(formatAsset(asset, null, null));
});

router.get("/assets/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const [cats, depts] = await Promise.all([
    db.select().from(assetCategoriesTable),
    db.select().from(departmentsTable),
  ]);
  const catMap = new Map(cats.map(c => [c.id, c.name]));
  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  // Allocation history with details
  const allocations = await db.select().from(assetAllocationsTable).where(eq(assetAllocationsTable.assetId, id)).orderBy(sql`${assetAllocationsTable.allocatedAt} DESC`);
  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map(u => [u.id, u]));

  const now = new Date();
  const allocationHistory = allocations.map(a => {
    const emp = userMap.get(a.employeeId);
    const isOverdue = a.status === "active" && a.expectedReturnDate !== null && new Date(a.expectedReturnDate) < now;
    return {
      id: a.id, assetId: a.assetId, assetTag: asset.assetTag, assetName: asset.name,
      employeeId: a.employeeId, employeeName: emp?.name ?? null,
      departmentId: a.departmentId, departmentName: a.departmentId ? deptMap.get(a.departmentId) ?? null : null,
      allocatedAt: a.allocatedAt.toISOString(),
      expectedReturnDate: a.expectedReturnDate,
      returnedAt: a.returnedAt ? a.returnedAt.toISOString() : null,
      returnConditionNotes: a.returnConditionNotes,
      status: a.status, isOverdue,
    };
  });

  // Maintenance history
  const maintenance = await db.select().from(maintenanceRequestsTable).where(eq(maintenanceRequestsTable.assetId, id)).orderBy(sql`${maintenanceRequestsTable.createdAt} DESC`);
  const maintenanceHistory = maintenance.map(m => {
    const raiser = userMap.get(m.raisedBy);
    return {
      id: m.id, assetId: m.assetId, assetName: asset.name, assetTag: asset.assetTag,
      raisedBy: m.raisedBy, raisedByName: raiser?.name ?? null,
      issueDescription: m.issueDescription, priority: m.priority, photoUrl: m.photoUrl,
      status: m.status, assignedTechnician: m.assignedTechnician,
      approvedBy: m.approvedBy, resolvedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(),
    };
  });

  res.json({
    ...formatAsset(asset, asset.categoryId ? catMap.get(asset.categoryId) ?? null : null, asset.departmentId ? deptMap.get(asset.departmentId) ?? null : null),
    allocationHistory,
    maintenanceHistory,
  });
});

router.patch("/assets/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const allowed = ["name", "categoryId", "serialNumber", "acquisitionDate", "acquisitionCost", "condition", "location", "photoUrl", "isBookable", "status", "departmentId"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in req.body) updates[key === "categoryId" ? "categoryId" : key] = req.body[key];
  }
  // map camelCase to snake_case for drizzle
  const dbUpdates: Record<string, unknown> = {};
  const keyMap: Record<string, string> = { categoryId: "categoryId", serialNumber: "serialNumber", acquisitionDate: "acquisitionDate", acquisitionCost: "acquisitionCost", photoUrl: "photoUrl", isBookable: "isBookable", departmentId: "departmentId", updatedAt: "updatedAt" };
  for (const [k, v] of Object.entries(updates)) {
    dbUpdates[k] = v;
  }

  const [updated] = await db.update(assetsTable).set(dbUpdates as Parameters<typeof db.update>[0] extends infer T ? any : any).where(eq(assetsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "update", entityType: "asset", entityId: id });
  res.json(formatAsset(updated, null, null));
});

export default router;
