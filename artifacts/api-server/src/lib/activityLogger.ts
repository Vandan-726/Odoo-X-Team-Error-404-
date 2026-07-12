import { createHash } from "crypto";
import { db, activityLogsTable } from "@workspace/db";

export async function logActivity(params: {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, action, entityType, entityId, metadata = {} } = params;

  const content = JSON.stringify({ userId, action, entityType, entityId, metadata, ts: Date.now() });
  const entryHash = createHash("sha256").update(content).digest("hex");

  await db.insert(activityLogsTable).values({
    userId,
    action,
    entityType,
    entityId: entityId ?? null,
    metadata,
    entryHash,
  });
}
