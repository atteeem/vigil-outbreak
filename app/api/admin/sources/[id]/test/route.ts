// Endpoint verification: fetches and parses without storing anything.
import { prisma } from "@/lib/db";
import { fetchWhoDon } from "@/lib/ingestion/adapters/who-don";
import { fetchRss } from "@/lib/ingestion/adapters/rss";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) return fail("Source not found", 404);
  if (!source.url || source.adapter === "MANUAL") return fail("Source has no fetchable URL", 422);
  try {
    const r = source.adapter === "WHO_DON_API" ? await fetchWhoDon(source.url) : await fetchRss(source.url);
    await prisma.source.update({ where: { id }, data: { endpointStatus: "WORKING" } });
    return json({ ok: true, httpStatus: r.httpStatus, items: r.items.length, itemErrors: r.itemErrors.length, sample: r.items.slice(0, 5).map((i) => ({ title: i.title, publishedAt: i.publishedAt, url: i.url })) });
  } catch (err) {
    await prisma.source.update({ where: { id }, data: { endpointStatus: "FAILING", lastError: (err as Error).message } });
    return json({ ok: false, error: (err as Error).message });
  }
}
