import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { CLASSIFICATIONS, PATHOGEN_STATUSES, CLASSIFICATION_LABEL, PATHOGEN_STATUS_LABEL } from "@/lib/domain/enums";

const Body = z.object({
  classification: z.enum(CLASSIFICATIONS),
  pathogenStatus: z.enum(PATHOGEN_STATUSES),
  diseaseId: z.string().nullable().optional(),
  reason: z.string().min(10).max(2000),
  effectiveAt: z.string().datetime().optional(),
  sourceArticleId: z.string().nullable().optional(),
});

/** Reclassification: appends history (never rewrites it) and posts a RECLASSIFICATION update, so a resolved or
 * ruled-out investigation keeps its full record. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    if (!body.ok) return body.res;
    const d = body.data;
    const o = await prisma.outbreak.findUnique({ where: { id } });
    if (!o) return fail("Not found", 404);
    const diseaseId = d.diseaseId === undefined ? o.diseaseId : d.diseaseId;
    if (d.pathogenStatus === "CONFIRMED" && !diseaseId) return fail("Confirming a pathogen requires the confirmed disease", 422);
    if (d.classification.startsWith("CONFIRMED") && d.pathogenStatus !== "CONFIRMED") return fail("A confirmed outbreak classification requires a laboratory-confirmed pathogen", 422);
    const article = d.sourceArticleId ? await prisma.sourceArticle.findUnique({ where: { id: d.sourceArticleId }, select: { sourceType: true } }) : null;
    const effectiveAt = d.effectiveAt ? new Date(d.effectiveAt) : new Date();
    await prisma.$transaction([
      prisma.investigationStatusHistory.create({ data: { outbreakId: id, fromClassification: o.classification, toClassification: d.classification, fromPathogenStatus: o.pathogenStatus, toPathogenStatus: d.pathogenStatus, reason: d.reason, effectiveAt, actor: "admin", sourceArticleId: d.sourceArticleId ?? null } }),
      prisma.outbreak.update({ where: { id }, data: { classification: d.classification, pathogenStatus: d.pathogenStatus, diseaseId: d.pathogenStatus === "CONFIRMED" ? diseaseId : null, resolvedAt: d.classification === "RESOLVED" ? (o.resolvedAt ?? effectiveAt) : null, lastVerifiedAt: effectiveAt } }),
      prisma.outbreakUpdate.create({ data: { outbreakId: id, kind: "RECLASSIFICATION", title: `Reclassified: ${CLASSIFICATION_LABEL[d.classification]} · pathogen ${PATHOGEN_STATUS_LABEL[d.pathogenStatus].toLowerCase()}`, body: d.reason, publishedAt: effectiveAt, sourceType: article?.sourceType ?? "MEDIA", verificationStatus: "VERIFIED", verifiedAt: effectiveAt, attributedTo: "VIGIL OUTBREAK analyst decision", sourceArticleId: d.sourceArticleId ?? null } }),
    ]);
    await audit("outbreak.reclassify", "outbreak", id, { from: [o.classification, o.pathogenStatus], to: [d.classification, d.pathogenStatus], reason: d.reason });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
