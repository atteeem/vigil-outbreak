import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { VERIFICATION_STATUSES, METRICS } from "@/lib/domain/enums";

const Body = z.object({
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  conflictNote: z.string().max(2000).nullable().optional(),
  /** Promote a numeric claim into a dated observation (keeps the claim's provenance). */
  promote: z.object({ outbreakId: z.string(), metric: z.enum(METRICS).optional(), asOfDate: z.string().datetime().nullable().optional(), isCumulative: z.boolean().default(true) }).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    if (!body.ok) return body.res;
    const claim = await prisma.evidenceClaim.findUnique({ where: { id }, include: { article: { include: { source: true } } } });
    if (!claim) return fail("Claim not found", 404);
    const d = body.data;
    const updated = await prisma.evidenceClaim.update({
      where: { id },
      data: { ...(d.verificationStatus ? { verificationStatus: d.verificationStatus, reviewedAt: new Date() } : {}), ...(d.conflictNote !== undefined ? { conflictNote: d.conflictNote } : {}) },
    });
    let observation = null;
    if (d.promote) {
      const metric = d.promote.metric ?? claim.metric;
      if (!metric) return fail("This claim has no metric; specify one explicitly (unqualified 'cases' are not automatically confirmed, probable or suspected).", 422);
      if (claim.value === null) return fail("Claim has no numeric value", 422);
      // Provenance is preserved: a media claim stays MEDIA even when verified, so it can never become a
      // headline "confirmed" figure (those require OFFICIAL + VERIFIED).
      observation = await prisma.outbreakObservation.create({
        data: {
          outbreakId: d.promote.outbreakId, metric, value: claim.value, isCumulative: d.promote.isCumulative,
          asOfDate: d.promote.asOfDate ? new Date(d.promote.asOfDate) : null, reportedAt: claim.publishedAt,
          sourceType: claim.sourceType, verificationStatus: updated.verificationStatus, verifiedAt: updated.reviewedAt,
          attributedTo: claim.attributedTo ?? claim.article?.source.name ?? "unknown", notes: `Promoted from claim: ${claim.text}`, sourceArticleId: claim.articleId,
        },
      });
    }
    await audit(d.promote ? "claim.promote" : "claim.review", "claim", id, { verificationStatus: d.verificationStatus, observationId: observation?.id });
    return json({ claim: updated, observation });
  } catch (err) {
    return handleError(err);
  }
}
