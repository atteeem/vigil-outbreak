import { prisma } from "@/lib/db";
import { ReviewQueue } from "@/components/admin/review-queue";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "PENDING" } = await searchParams;
  const reviewStatus = ["PENDING", "ACCEPTED", "REJECTED", "DUPLICATE"].includes(status) ? status : "PENDING";
  const [articles, outbreaks, counts] = await Promise.all([
    prisma.sourceArticle.findMany({ where: { reviewStatus }, orderBy: { publishedAt: "desc" }, take: 100, include: { source: { select: { name: true, kind: true } }, claims: { orderBy: { createdAt: "asc" } } } }),
    prisma.outbreak.findMany({ where: { mergedIntoId: null }, orderBy: { title: "asc" }, select: { id: true, title: true, slug: true } }),
    prisma.sourceArticle.groupBy({ by: ["reviewStatus"], _count: true }),
  ]);
  return <ReviewQueue articles={JSON.parse(JSON.stringify(articles))} outbreaks={outbreaks} status={reviewStatus} counts={Object.fromEntries(counts.map((c) => [c.reviewStatus, c._count]))} />;
}
