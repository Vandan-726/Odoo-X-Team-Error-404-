import { Router } from "express";
import { db, usersTable, departmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

function formatUser(user: typeof usersTable.$inferSelect, deptName: string | null) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: deptName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const { department, role } = req.query;
  const conditions = [];
  if (department) conditions.push(eq(usersTable.departmentId, Number(department)));
  if (role && typeof role === "string") conditions.push(eq(usersTable.role, role));

  const users = conditions.length
    ? await db.select().from(usersTable).where(and(...conditions)).orderBy(usersTable.name)
    : await db.select().from(usersTable).orderBy(usersTable.name);

  const depts = await db.select().from(departmentsTable);
  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  res.json(users.map(u => formatUser(u, u.departmentId ? deptMap.get(u.departmentId) ?? null : null)));
});

router.patch("/users/:id/role", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { role } = req.body;
  const validRoles = ["admin", "asset_manager", "department_head", "employee"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const [updated] = await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "update_role", entityType: "user", entityId: id, metadata: { role } });
  let deptName: string | null = null;
  if (updated.departmentId) {
    const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, updated.departmentId));
    deptName = d?.name ?? null;
  }
  res.json(formatUser(updated, deptName));
});

router.patch("/users/:id/status", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { status } = req.body;
  const validStatuses = ["active", "inactive"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db.update(usersTable).set({ status, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "update_status", entityType: "user", entityId: id, metadata: { status } });
  let deptName: string | null = null;
  if (updated.departmentId) {
    const [d] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, updated.departmentId));
    deptName = d?.name ?? null;
  }
  res.json(formatUser(updated, deptName));
});

export default router;
