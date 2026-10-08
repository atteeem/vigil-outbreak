import { prisma } from "@/lib/db";
import { SourcesAdmin } from "@/components/admin/sources-admin";
import { schedulerState } from "@/lib/ingestion/scheduler";
import { computeLiveStatus } from "@/lib/domain/live-status";

export default async function AdminHome() {
  const sources = await prisma.source.findMany({ orderBy: [{ adapter: "asc" }, { name: "asc" }], include: { runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { articles: true } } } });
  const pending = await prisma.sourceArticle.count({ where: { reviewStatus: "PENDING" } });
  const live = computeLiveStatus(sources);
  return <SourcesAdmin sources={JSON.parse(JSON.stringify(sources))} pending={pending} scheduler={schedulerState()} live={live} />;
}
