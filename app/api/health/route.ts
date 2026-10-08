// Health endpoint for uptime monitors / load balancers.
//   GET /api/health          200 while the web app and database work (ingestion state reported, not enforced)
//   GET /api/health?strict=1 additionally 503 unless ingestion is genuinely live (recent real success + heartbeat)
import { NextResponse } from "next/server";
import { prisma, isPostgres } from "@/lib/db";
import { getFreshness } from "@/lib/server/queries";
import { ingestionMode } from "@/lib/ingestion/mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  const at = new Date().toISOString();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (err) {
    return NextResponse.json({ ok: false, at, web: "ok", database: { ok: false, error: (err as Error).message } }, { status: 503 });
  }
  const f = await getFreshness();
  const live = f.live.state === "LIVE";
  const body = {
    ok: strict ? live : true,
    at,
    web: "ok",
    database: { ok: true, provider: isPostgres ? "postgresql" : "sqlite" },
    ingestion: { mode: ingestionMode(), state: f.live.state, detail: f.live.detail, lastLiveSuccessAt: f.live.lastLiveSuccessAt, worker: f.live.worker, failing: f.live.failing.map((x) => ({ source: x.slug, kind: x.kind })) },
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
