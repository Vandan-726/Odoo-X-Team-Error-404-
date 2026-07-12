import { Router } from "express";
import { db, departmentsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

async function getDeptWithDetails(id: number) {
  const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id));
  if (!dept) return null;

  let headUserName: string | null = null;
  if (dept.headUserId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, dept.headUserId));
    headUserName = u?.name ?? null;
  }
  let parentName: string | null = null;
  if (dept.parentDepartmentId) {
    const [p] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, dept.parentDepartmentId));
    parentName = p?.name ?? null;
  }
  const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.departmentId, id));
  const employeeCount = countResult[0]?.count ?? 0;

  return {
    id: dept.id,
    name: dept.name,
    headUserId: dept.headUserId,
    headUserName,
    parentDepartmentId: dept.parentDepartmentId,
    parentDepartmentName: parentName,
    status: dept.status,
    createdAt: dept.createdAt.toISOString(),
    employeeCount,
  };
}

router.get("/departments", requireAuth, async (req, res): Promise<void> => {
  const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  const results = await Promise.all(depts.map(d => getDeptWithDetails(d.id)));
  res.json(results.filter(Boolean));
});

router.post("/departments", requireAuth, async (req, res): Promise<void> => {
  const { name, headUserId, parentDepartmentId, status } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [dept] = await db.insert(departmentsTable).values({
    name,
    headUserId: headUserId ?? null,
    parentDepartmentId: parentDepartmentId ?? null,
    status: status ?? "active",
  }).returning();
  await logActivity({ userId: req.session.user!.id, action: "create", entityType: "department", entityId: dept.id, metadata: { name } });
  const result = await getDeptWithDetails(dept.id);
  res.status(201).json(result);
});

router.patch("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, headUserId, parentDepartmentId, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (headUserId !== undefined) updates.headUserId = headUserId;
  if (parentDepartmentId !== undefined) updates.parentDepartmentId = parentDepartmentId;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(departmentsTable).set(updates).where(eq(departmentsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "update", entityType: "department", entityId: id });
  const result = await getDeptWithDetails(id);
  res.json(result);
});

export default router;
