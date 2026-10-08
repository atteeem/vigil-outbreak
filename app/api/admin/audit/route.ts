import { prisma } from "@/lib/db";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ entries: await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) });
}
