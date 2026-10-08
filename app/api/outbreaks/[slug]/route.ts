import { getOutbreakDetail } from "@/lib/server/queries";
import { parseAsOf } from "@/lib/domain/timeline";
import { json, fail, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const detail = await getOutbreakDetail(slug, parseAsOf(new URL(req.url).searchParams.get("asOf")));
    if (!detail) return fail("Outbreak not found", 404);
    return json(detail);
  } catch (err) {
    return handleError(err);
  }
}
