import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";

/** Merges this (duplicate) record INTO targetId. Evidence moves to the target; the duplicate is kept,
 * unpublished, with mergedIntoId set so links and history still resolve. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, z.object({ targetId: z.string().min(1), reason: z.string().min(5).max(1000) }));
    if (!body.ok) return body.res;
    const { targetId, reason } = body.data;
    if (targetId === id) return fail("Cannot merge a record into itself", 422);
    const [src, target] = await Promise.all([prisma.outbreak.findUnique({ where: { id } }), prisma.outbreak.findUnique({ where: { id: targetId } })]);
    if (!src || !target) return fail("Not found", 404);
    if (target.mergedIntoId) return fail("Target is itself merged; merge into the surviving record", 422);
    const moved = await prisma.$transaction(async (tx) => {
      const counts = {
        articles: (await tx.sourceArticle.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
        observations: (await tx.outbreakObservation.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
        updates: (await tx.outbreakUpdate.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
        claims: (await tx.evidenceClaim.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
        locations: (await tx.outbreakLocation.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
        risk: (await tx.riskAssessment.updateMany({ where: { outbreakId: id }, data: { outbreakId: targetId } })).count,
      };
      await tx.outbreak.update({ where: { id }, data: { mergedIntoId: targetId, published: false } });
      const firstReportedAt = src.firstReportedAt < target.firstReportedAt ? src.firstReportedAt : target.firstReportedAt;
      await tx.outbreak.update({ where: { id: targetId }, data: { firstReportedAt } });
      await tx.outbreakUpdate.create({ data: { outbreakId: targetId, kind: "CORRECTION", title: `Merged duplicate record “${src.title}”`, body: reason, publishedAt: new Date(), sourceType: "MEDIA", verificationStatus: "VERIFIED", verifiedAt: new Date(), attributedTo: "VIGIL OUTBREAK analyst decision" } });
      return counts;
    });
    await audit("outbreak.merge", "outbreak", id, { into: targetId, reason, moved });
    return json({ ok: true, moved });
  } catch (err) {
    return handleError(err);
  }
}
