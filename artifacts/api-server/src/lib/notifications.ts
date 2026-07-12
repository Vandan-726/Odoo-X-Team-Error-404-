import { db, notificationsTable } from "@workspace/db";

export async function createNotification(params: {
  userId: number;
  type: string;
  message: string;
  referenceType?: string;
  referenceId?: number;
}): Promise<void> {
  await db.insert(notificationsTable).values({
    userId: params.userId,
    type: params.type,
    message: params.message,
    referenceType: params.referenceType ?? null,
    referenceId: params.referenceId ?? null,
  });
}
