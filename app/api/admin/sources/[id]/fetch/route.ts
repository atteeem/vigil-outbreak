import { runSource } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/admin/audit";
import { prisma } from "@/lib/db";
import { json, fail, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!(await prisma.source.findUnique({ where: { id }, select: { id: true } }))) return fail("Source not found", 404);
    const result = await runSource(id, "MANUAL");
    await audit("ingest.fetch_source", "source", id, { status: result.status, new: result.itemsNew, duplicate: result.itemsDuplicate, error: result.error });
    return json({ result });
  } catch (err) {
    return handleError(err);
  }
}
