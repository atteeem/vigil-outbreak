import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { UPDATE_KINDS, SOURCE_TYPES, VERIFICATION_STATUSES } from "@/lib/domain/enums";

const Body = z.object({
  kind: z.enum(UPDATE_KINDS),
  title: z.string().min(3).max(300),
  body: z.string().min(3).max(5000),
  occurredAt: z.string().datetime().nullable().optional(),
  publishedAt: z.string().datetime(),
  sourceType: z.enum(SOURCE_TYPES),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  attributedTo: z.string().min(2).max(300),
  sourceArticleId: z.string().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    if (!body.ok) return body.res;
    if (!(await prisma.outbreak.findUnique({ where: { id }, select: { id: true } }))) return fail("Not found", 404);
    const d = body.data;
    const update = await prisma.outbreakUpdate.create({ data: { ...d, outbreakId: id, occurredAt: d.occurredAt ? new Date(d.occurredAt) : null, publishedAt: new Date(d.publishedAt), verifiedAt: d.verificationStatus !== "UNVERIFIED" ? new Date() : null } });
    await audit(d.kind === "CORRECTION" ? "update.correction" : "update.create", "outbreak", id, { updateId: update.id, title: d.title });
    return json({ update }, 201);
  } catch (err) {
    return handleError(err);
  }
}
