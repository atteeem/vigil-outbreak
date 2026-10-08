import { prisma } from "@/lib/db";

export async function audit(action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await prisma.adminAuditLog.create({ data: { action, entityType, entityId, details: JSON.stringify(details) } });
}
