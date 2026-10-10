import { prisma } from "@/lib/db";
import { ReviewQueue } from "@/components/admin/review-queue";
import { getPrimaryTrackedEvent } from "@/lib/server/tracker";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string; scope?: string }> }) {
  const { status = "PENDING", scope: scopeParam } = await searchParams;
  const reviewStatus = ["PENDING", "ACCEPTED", "REJECTED", "DUPLICATE"].includes(status) ? status : "PENDING";
  const tracked = await getPrimaryTrackedEvent();
  const scope = tracked && scopeParam === "tracked" ? "tracked" : "all";
  const [articles, outbreaks, counts, trackedPending] = await Promise.all([
    prisma.sourceArticle.findMany({
      where: { reviewStatus, ...(scope === "tracked" && tracked ? { trackedEventId: tracked.id } : {}) },
      // Priority: possible material changes about a tracked event, then other tracked articles, then the rest.
      orderBy: [{ materialChange: "desc" }, { trackedScore: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }],
      take: 100,
      include: { source: { select: { name: true, kind: true } }, claims: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.outbreak.findMany({ where: { mergedIntoId: null }, orderBy: { title: "asc" }, select: { id: true, title: true, slug: true } }),
    prisma.sourceArticle.groupBy({ by: ["reviewStatus"], _count: true }),
    tracked ? prisma.sourceArticle.count({ where: { trackedEventId: tracked.id, reviewStatus: "PENDING" } }) : Promise.resolve(0),
  ]);
  return (
    <ReviewQueue
      articles={JSON.parse(JSON.stringify(articles))}
      outbreaks={outbreaks}
      status={reviewStatus}
      scope={scope}
      counts={Object.fromEntries(counts.map((c) => [c.reviewStatus, c._count]))}
      tracked={tracked ? { id: tracked.id, name: tracked.name, outbreakId: tracked.outbreakId, pending: trackedPending } : null}
    />
  );
}
