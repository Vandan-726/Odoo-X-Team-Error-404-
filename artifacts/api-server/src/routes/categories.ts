import { Router } from "express";
import { db, assetCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";

const router = Router();

function formatCategory(cat: typeof assetCategoriesTable.$inferSelect) {
  return {
    id: cat.id,
    name: cat.name,
    extraFields: cat.extraFields ?? {},
    createdAt: cat.createdAt.toISOString(),
  };
}

router.get("/categories", requireAuth, async (_req, res): Promise<void> => {
  const cats = await db.select().from(assetCategoriesTable).orderBy(assetCategoriesTable.name);
  res.json(cats.map(formatCategory));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const { name, extraFields } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [cat] = await db.insert(assetCategoriesTable).values({
    name,
    extraFields: extraFields ?? {},
  }).returning();
  await logActivity({ userId: req.session.user!.id, action: "create", entityType: "category", entityId: cat.id, metadata: { name } });
  res.status(201).json(formatCategory(cat));
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, extraFields } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (extraFields !== undefined) updates.extraFields = extraFields;

  const [updated] = await db.update(assetCategoriesTable).set(updates).where(eq(assetCategoriesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await logActivity({ userId: req.session.user!.id, action: "update", entityType: "category", entityId: id });
  res.json(formatCategory(updated));
});

export default router;
