import { getFreshness } from "@/lib/server/queries";
import { schedulerState } from "@/lib/ingestion/scheduler";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ ...(await getFreshness()), scheduler: schedulerState() });
  } catch (err) {
    return handleError(err);
  }
}
