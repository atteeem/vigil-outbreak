import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/admin/audit";
import { flagConflicts } from "@/lib/ingestion/pipeline";
import { json, parseBody, fail, handleError } from "@/lib/server/http";

const Action = z.object({
  action: z.enum(["accept", "reject", "duplicate", "reopen", "verify", "validate-primary", "unvalidate-primary", "mark-relevant", "mark-not-relevant"]),
  outbreakId: z.string().nullable().optional(),
  duplicateOfId: z.string().optional(),
  verificationStatus: z.enum(["UNVERIFIED", "VERIFIED", "DISPUTED", "RETRACTED"]).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await parseBody(req, Action);
    if (!body.ok) return body.res;
    const article = await prisma.sourceArticle.findUnique({ where: { id } });
    if (!article) return fail("Article not found", 404);
    const { action } = body.data;
    let data: Parameters<typeof prisma.sourceArticle.update>[0]["data"] = {};
    if (action === "accept") {
      const outbreakId = body.data.outbreakId === undefined ? article.suggestedOutbreakId : body.data.outbreakId;
      if (outbreakId && !(await prisma.outbreak.findUnique({ where: { id: outbreakId }, select: { id: true } }))) return fail("Outbreak not found", 404);
      data = { reviewStatus: "ACCEPTED", outbreakId: outbreakId ?? null };
      // Claims follow the article's outbreak link; they remain UNVERIFIED until an analyst reviews them.
      await prisma.evidenceClaim.updateMany({ where: { articleId: id }, data: { outbreakId: outbreakId ?? null } });
      if (outbreakId) await flagConflicts(id, outbreakId);
    } else if (action === "reject") data = { reviewStatus: "REJECTED" };
    else if (action === "duplicate") {
      if (!body.data.duplicateOfId) return fail("duplicateOfId required", 422);
      data = { reviewStatus: "DUPLICATE", duplicateOfId: body.data.duplicateOfId };
    } else if (action === "reopen") data = { reviewStatus: "PENDING" };
    else if (action === "verify") {
      if (!body.data.verificationStatus) return fail("verificationStatus required", 422);
      data = { verificationStatus: body.data.verificationStatus };
    }
    else if (action === "validate-primary") data = { primaryValidatedAt: new Date() };
    // Analyst override of the content classifier; never creates or links an outbreak by itself.
    else if (action === "mark-relevant") data = { outbreakRelevant: true };
    else if (action === "mark-not-relevant") data = { outbreakRelevant: false, suggestedOutbreakId: null };
    else if (action === "unvalidate-primary") data = { primaryValidatedAt: null };
    const updated = await prisma.sourceArticle.update({ where: { id }, data });
    await audit(`article.${action}`, "article", id, body.data);
    return json({ article: updated });
  } catch (err) {
    return handleError(err);
  }
}
