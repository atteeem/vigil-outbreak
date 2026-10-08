import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { LocationInput } from "../route";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const outbreak = await prisma.outbreak.findUnique({
    where: { id },
    include: { locations: true, observations: { orderBy: { reportedAt: "desc" } }, updates: { orderBy: { publishedAt: "desc" } }, statusHistory: { orderBy: { effectiveAt: "desc" } }, claims: { orderBy: { publishedAt: "desc" }, include: { article: { select: { title: true, url: true } } } }, articles: { orderBy: { publishedAt: "desc" }, select: { id: true, title: true, url: true, publishedAt: true, sourceType: true } }, riskAssessments: true },
  });
  if (!outbreak) return fail("Not found", 404);
  return json({ outbreak });
}

// Editing never touches classification or pathogen status: those go through /classification so every change
// is recorded in InvestigationStatusHistory.
const Patch = z.object({
  title: z.string().min(5).max(300).optional(),
  summary: z.string().min(10).max(5000).optional(),
  suspectedDiseaseId: z.string().nullable().optional(),
  eventStartDate: z.string().datetime().nullable().optional(),
  lastVerifiedAt: z.string().datetime().nullable().optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  addLocation: LocationInput.optional(),
  removeLocationId: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Patch);
    if (!body.ok) return body.res;
    const existing = await prisma.outbreak.findUnique({ where: { id } });
    if (!existing) return fail("Not found", 404);
    if (existing.mergedIntoId && body.data.published) return fail("A merged record cannot be republished; edit the surviving record", 422);
    const { addLocation, removeLocationId, eventStartDate, lastVerifiedAt, ...rest } = body.data;
    const outbreak = await prisma.outbreak.update({
      where: { id },
      data: {
        ...rest,
        ...(eventStartDate !== undefined ? { eventStartDate: eventStartDate ? new Date(eventStartDate) : null } : {}),
        ...(lastVerifiedAt !== undefined ? { lastVerifiedAt: lastVerifiedAt ? new Date(lastVerifiedAt) : null } : {}),
        ...(addLocation ? { locations: { create: { ...addLocation, firstReportedAt: new Date() } } } : {}),
      },
    });
    if (removeLocationId) await prisma.outbreakLocation.deleteMany({ where: { id: removeLocationId, outbreakId: id } });
    const action = body.data.published === true ? "outbreak.publish" : body.data.published === false ? "outbreak.unpublish" : "outbreak.update";
    await audit(action, "outbreak", id, body.data);
    return json({ outbreak });
  } catch (err) {
    return handleError(err);
  }
}
