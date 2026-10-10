import { prisma } from "@/lib/db";
import { SourcesAdmin } from "@/components/admin/sources-admin";
import { schedulerState } from "@/lib/ingestion/scheduler";
import { computeLiveStatus } from "@/lib/domain/live-status";
import Link from "next/link";
import { getPrimaryTrackedEvent } from "@/lib/server/tracker";

export default async function AdminHome() {
  const sources = await prisma.source.findMany({ orderBy: [{ adapter: "asc" }, { name: "asc" }], include: { runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { articles: true } } } });
  const pending = await prisma.sourceArticle.count({ where: { reviewStatus: "PENDING" } });
  const beat = await prisma.workerHeartbeat.findFirst({ orderBy: { lastTickAt: "desc" } });
  const live = computeLiveStatus(sources, new Date(), beat);
  const tracked = await getPrimaryTrackedEvent();
  const [trackedPending, material] = tracked
    ? await Promise.all([
        prisma.sourceArticle.count({ where: { trackedEventId: tracked.id, reviewStatus: "PENDING" } }),
        prisma.sourceArticle.count({ where: { trackedEventId: tracked.id, reviewStatus: "PENDING", materialChange: true } }),
      ])
    : [0, 0];
  return (
    <>
      {tracked && (
        <p className="mb-3 rounded-lg border border-accent/30 bg-accent-dim/40 px-4 py-2 text-xs" data-testid="tracked-review-summary">
          Tracked investigation: <span className="font-medium">{tracked.name}</span> ·{" "}
          <Link href="/admin/review?scope=tracked" className="text-accent">{trackedPending} related article{trackedPending === 1 ? "" : "s"} awaiting review</Link>
          {material > 0 && <span className="text-warn"> · {material} possible material change{material === 1 ? "" : "s"}</span>} ·{" "}
          <Link href={`/admin/outbreaks/${tracked.outbreak.id}`} className="text-accent">edit record, locations and tracking terms</Link>
        </p>
      )}
      <SourcesAdmin sources={JSON.parse(JSON.stringify(sources))} pending={pending} scheduler={schedulerState()} live={live} />
    </>
  );
}
