import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { LocationInput } from "../route";
import { locationVerdict } from "@/lib/tracked/timeline";
import { VERIFICATION_STATUSES } from "@/lib/domain/enums";

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
  /** Verify / unverify / dispute a location, optionally recording the evidence. */
  updateLocation: z.object({ id: z.string(), verificationStatus: z.enum(VERIFICATION_STATUSES), evidence: z.string().max(2000).nullable().optional() }).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Patch);
    if (!body.ok) return body.res;
    const existing = await prisma.outbreak.findUnique({ where: { id } });
    if (!existing) return fail("Not found", 404);
    if (existing.mergedIntoId && body.data.published) return fail("A merged record cannot be republished; edit the surviving record", 422);
    const { addLocation, removeLocationId, updateLocation, eventStartDate, lastVerifiedAt, ...rest } = body.data;
    // Spread is judged against the tracked event's origin region when this outbreak is tracked, else its country.
    const tracked = await prisma.trackedEvent.findUnique({ where: { outbreakId: id } });
    const origin = { countryCode: tracked?.originCountryCode ?? existing.countryCode, admin1: tracked?.originAdmin1 ?? null };
    const addVerdict = addLocation ? locationVerdict(addLocation, origin) : null;
    if (addVerdict && !addVerdict.ok) return fail(addVerdict.error, 422);
    if (updateLocation) {
      const loc = await prisma.outbreakLocation.findFirst({ where: { id: updateLocation.id, outbreakId: id } });
      if (!loc) return fail("Location not found", 404);
      const v = locationVerdict({ ...loc, verificationStatus: updateLocation.verificationStatus, evidence: updateLocation.evidence ?? loc.evidence }, origin);
      if (!v.ok) return fail(v.error, 422);
      await prisma.outbreakLocation.update({ where: { id: loc.id }, data: { verificationStatus: v.verificationStatus, evidence: updateLocation.evidence ?? loc.evidence, verifiedAt: v.verificationStatus === "UNVERIFIED" ? null : new Date() } });
    }
    const outbreak = await prisma.outbreak.update({
      where: { id },
      data: {
        ...rest,
        ...(eventStartDate !== undefined ? { eventStartDate: eventStartDate ? new Date(eventStartDate) : null } : {}),
        ...(lastVerifiedAt !== undefined ? { lastVerifiedAt: lastVerifiedAt ? new Date(lastVerifiedAt) : null } : {}),
        ...(addLocation && addVerdict?.ok ? { locations: { create: { ...addLocation, verificationStatus: addVerdict.verificationStatus, verifiedAt: addVerdict.verificationStatus === "UNVERIFIED" ? null : new Date(), firstReportedAt: new Date() } } } : {}),
      },
    });
    if (removeLocationId) await prisma.outbreakLocation.deleteMany({ where: { id: removeLocationId, outbreakId: id } });
    const action = body.data.published === true ? "outbreak.publish" : body.data.published === false ? "outbreak.unpublish" : updateLocation ? "location.verification" : addLocation ? "location.add" : "outbreak.update";
    await audit(action, "outbreak", id, body.data);
    return json({ outbreak });
  } catch (err) {
    return handleError(err);
  }
}
