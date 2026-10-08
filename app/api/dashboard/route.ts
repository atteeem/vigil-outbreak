import { getDashboard, parseFilters } from "@/lib/server/queries";
import { parseAsOf } from "@/lib/domain/timeline";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    return json(await getDashboard(parseAsOf(sp.get("asOf")), parseFilters(sp)));
  } catch (err) {
    return handleError(err);
  }
}
