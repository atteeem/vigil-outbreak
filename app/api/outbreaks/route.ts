import { listOutbreaks, parseFilters } from "@/lib/server/queries";
import { parseAsOf } from "@/lib/domain/timeline";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const outbreaks = await listOutbreaks(parseAsOf(sp.get("asOf")), parseFilters(sp));
    return json({ outbreaks });
  } catch (err) {
    return handleError(err);
  }
}
