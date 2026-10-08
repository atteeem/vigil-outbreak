import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";

const Patch = z.object({
  name: z.string().min(2).max(200).optional(),
  url: z.string().url().nullable().optional(),
  enabled: z.boolean().optional(),
  pollIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Patch);
    if (!body.ok) return body.res;
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) return fail("Source not found", 404);
    if (body.data.enabled && existing.adapter !== "MANUAL" && !(body.data.url ?? existing.url)) return fail("Cannot enable a source without a URL", 422);
    const source = await prisma.source.update({ where: { id }, data: { ...body.data, ...(body.data.url !== undefined && body.data.url !== existing.url ? { endpointStatus: "UNTESTED" } : {}) } });
    await audit("source.update", "source", id, body.data);
    return json({ source });
  } catch (err) {
    return handleError(err);
  }
}
