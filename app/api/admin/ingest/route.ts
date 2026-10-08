import { runAll } from "@/lib/ingestion/pipeline";
import { audit } from "@/lib/admin/audit";
import { json, handleError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** "Fetch Now" for every enabled automatic source. */
export async function POST() {
  try {
    const results = await runAll("MANUAL");
    await audit("ingest.fetch_all", "source", null, { results: results.map((r) => ({ source: r.sourceName, status: r.status, new: r.itemsNew, error: r.error })) });
    return json({ results });
  } catch (err) {
    return handleError(err);
  }
}
