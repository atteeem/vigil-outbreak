import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { METRICS, SOURCE_TYPES, VERIFICATION_STATUSES } from "@/lib/domain/enums";

const Body = z.object({
  metric: z.enum(METRICS),
  // null = explicitly "not reported". Never default a missing value to 0.
  value: z.number().int().min(0).nullable(),
  valueHigh: z.number().int().min(0).nullable().optional(),
  isCumulative: z.boolean().default(true),
  deathCauseConfirmed: z.boolean().nullable().optional(),
  scope: z.string().max(200).nullable().optional(),
  asOfDate: z.string().datetime().nullable().optional(),
  reportedAt: z.string().datetime(),
  sourceType: z.enum(SOURCE_TYPES),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  attributedTo: z.string().min(2).max(300),
  notes: z.string().max(2000).nullable().optional(),
  sourceArticleId: z.string().nullable().optional(),
});

/** Appends a dated observation. Earlier observations are never overwritten. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    if (!body.ok) return body.res;
    if (!(await prisma.outbreak.findUnique({ where: { id }, select: { id: true } }))) return fail("Not found", 404);
    const d = body.data;
    const obs = await prisma.outbreakObservation.create({
      data: { ...d, outbreakId: id, asOfDate: d.asOfDate ? new Date(d.asOfDate) : null, reportedAt: new Date(d.reportedAt), verifiedAt: d.verificationStatus !== "UNVERIFIED" ? new Date() : null },
    });
    await audit("observation.create", "outbreak", id, { observationId: obs.id, metric: d.metric, value: d.value, sourceType: d.sourceType });
    return json({ observation: obs }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, z.object({ observationId: z.string(), verificationStatus: z.enum(VERIFICATION_STATUSES), notes: z.string().max(2000).optional() }));
    if (!body.ok) return body.res;
    const obs = await prisma.outbreakObservation.findFirst({ where: { id: body.data.observationId, outbreakId: id } });
    if (!obs) return fail("Observation not found", 404);
    const updated = await prisma.outbreakObservation.update({ where: { id: obs.id }, data: { verificationStatus: body.data.verificationStatus, verifiedAt: new Date(), ...(body.data.notes ? { notes: body.data.notes } : {}) } });
    await audit("observation.verify", "outbreak", id, { observationId: obs.id, from: obs.verificationStatus, to: body.data.verificationStatus });
    return json({ observation: updated });
  } catch (err) {
    return handleError(err);
  }
}
