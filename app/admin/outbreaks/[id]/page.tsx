import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OutbreakEditor } from "@/components/admin/outbreak-editor";

export default async function EditOutbreak({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, diseases, others] = await Promise.all([
    prisma.outbreak.findUnique({
      where: { id },
      include: { disease: true, suspectedDisease: true, mergedInto: { select: { id: true, title: true } }, locations: true, observations: { orderBy: { reportedAt: "desc" } }, updates: { orderBy: { publishedAt: "desc" } }, statusHistory: { orderBy: { effectiveAt: "desc" } }, claims: { orderBy: { publishedAt: "desc" } }, articles: { orderBy: { publishedAt: "desc" }, select: { id: true, title: true, url: true, publishedAt: true, sourceType: true } } },
    }),
    prisma.disease.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.outbreak.findMany({ where: { id: { not: id }, mergedIntoId: null }, select: { id: true, title: true, slug: true }, orderBy: { title: "asc" } }),
  ]);
  if (!o) notFound();
  return <OutbreakEditor o={JSON.parse(JSON.stringify(o))} diseases={diseases} others={others} />;
}
