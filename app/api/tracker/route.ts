import { getTracker } from "@/lib/server/tracker";
import { parseAsOf } from "@/lib/domain/timeline";
import { json, fail, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The primary tracked investigation (status, sourced metrics, timeline, locations, spread, targeted intel). */
export async function GET(req: Request) {
  try {
    const t = await getTracker(parseAsOf(new URL(req.url).searchParams.get("asOf")));
    return t ? json(t) : fail("No tracked event is configured.", 404);
  } catch (err) {
    return handleError(err);
  }
}
