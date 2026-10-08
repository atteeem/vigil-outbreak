import { listFeed, parseFilters } from "@/lib/server/queries";
import { parseAsOf } from "@/lib/domain/timeline";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const st = sp.get("sourceType");
    const items = await listFeed(parseAsOf(sp.get("asOf")), { ...parseFilters(sp), sourceType: st === "OFFICIAL" || st === "MEDIA" ? st : null, includeAllTypes: sp.get("types") === "all" }, Math.min(Number(sp.get("limit")) || 60, 200));
    return json({ items });
  } catch (err) {
    return handleError(err);
  }
}
