import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { json, parseBody, fail, handleError } from "@/lib/server/http";
import { tagUntrackedArticles } from "@/lib/tracked/store";

const Terms = z.array(z.string().trim().min(2).max(80)).max(80);
const Body = z.object({
  name: z.string().min(3).max(120),
  active: z.boolean().default(true),
  primary: z.boolean().default(false),
  originAdmin1: z.string().max(120).nullable().optional(),
  anchorTerms: Terms.min(1),
  contextTerms: Terms.min(1),
  weakAnchorTerms: Terms.default([]),
  mapCenterLat: z.number().min(-90).max(90),
  mapCenterLng: z.number().min(-180).max(180),
  mapZoom: z.number().min(1).max(14).default(8),
});

/** Makes this outbreak a tracked event (or edits its configuration). Making it primary moves the main dashboard to
 * it. Newly matching articles are tagged; nothing is linked, verified or published. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    if (!body.ok) return body.res;
    const o = await prisma.outbreak.findUnique({ where: { id } });
    if (!o) return fail("Not found", 404);
    if (o.mergedIntoId) return fail("A merged record cannot be tracked; track the surviving record", 422);
    const d = body.data;
    const data = { ...d, originCountryCode: o.countryCode, originAdmin1: d.originAdmin1 ?? null, anchorTerms: JSON.stringify(d.anchorTerms), contextTerms: JSON.stringify(d.contextTerms), weakAnchorTerms: JSON.stringify(d.weakAnchorTerms) };
    const tracked = await prisma.$transaction(async (tx) => {
      if (d.primary) await tx.trackedEvent.updateMany({ where: { outbreakId: { not: id } }, data: { primary: false } });
      return tx.trackedEvent.upsert({ where: { outbreakId: id }, update: data, create: { ...data, outbreakId: id } });
    });
    const tagged = await tagUntrackedArticles();
    await audit("tracked.update", "outbreak", id, { name: d.name, primary: d.primary, active: d.active, tagged });
    return json({ tracked, tagged });
  } catch (err) {
    return handleError(err);
  }
}
