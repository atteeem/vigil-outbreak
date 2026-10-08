// Endpoint verification: fetches and parses without storing anything; records the classified outcome.
import { prisma } from "@/lib/db";
import { runAdapter } from "@/lib/ingestion/pipeline";
import { IngestionError } from "@/lib/ingestion/types";
import { FAILURE_HINT, FAILURE_LABEL } from "@/lib/ingestion/errors";
import { audit } from "@/lib/admin/audit";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) return fail("Source not found", 404);
  if (!source.url || source.adapter === "MANUAL") return fail("Source has no fetchable URL", 422);
  const at = new Date();
  try {
    const r = await runAdapter(source.adapter, source.url, { maxPages: 1 });
    const newest = r.items.reduce<Date | null>((m, i) => (!m || i.publishedAt > m ? i.publishedAt : m), null);
    const summary = `OK: HTTP ${r.httpStatus}, ${r.items.length} items parsed, ${r.itemErrors.length} skipped, newest ${newest?.toISOString() ?? "n/a"}`;
    await prisma.source.update({ where: { id }, data: { endpointStatus: "WORKING", lastVerifiedAt: at, lastVerification: summary } });
    await audit("source.test", "source", id, { ok: true, items: r.items.length });
    return json({ ok: true, httpStatus: r.httpStatus, items: r.items.length, itemErrors: r.itemErrors.length, newest, sample: r.items.slice(0, 5).map((i) => ({ title: i.title, publishedAt: i.publishedAt, url: i.url })) });
  } catch (err) {
    const kind = err instanceof IngestionError ? err.kind : "UNKNOWN";
    const message = (err as Error).message;
    await prisma.source.update({ where: { id }, data: { endpointStatus: kind === "NETWORK_POLICY_BLOCKED" ? "BLOCKED" : "FAILING", lastError: message, lastErrorKind: kind, lastVerifiedAt: at, lastVerification: `${FAILURE_LABEL[kind]}: ${message}` } });
    await audit("source.test", "source", id, { ok: false, kind, message });
    return json({ ok: false, kind, label: FAILURE_LABEL[kind], hint: FAILURE_HINT[kind], error: message });
  }
}
