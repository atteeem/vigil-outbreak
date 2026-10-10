import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OutbreakEditor } from "@/components/admin/outbreak-editor";
import { TrackedEditor } from "@/components/admin/tracked-editor";
import { parseTerms } from "@/lib/tracked/relevance";

export default async function EditOutbreak({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, diseases, others] = await Promise.all([
    prisma.outbreak.findUnique({
      where: { id },
      include: { disease: true, suspectedDisease: true, mergedInto: { select: { id: true, title: true } }, locations: { orderBy: { firstReportedAt: "asc" } }, trackedEvent: true, observations: { orderBy: { reportedAt: "desc" } }, updates: { orderBy: { publishedAt: "desc" } }, statusHistory: { orderBy: { effectiveAt: "desc" } }, claims: { orderBy: { publishedAt: "desc" } }, articles: { orderBy: { publishedAt: "desc" }, select: { id: true, title: true, url: true, publishedAt: true, sourceType: true } } },
    }),
    prisma.disease.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.outbreak.findMany({ where: { id: { not: id }, mergedIntoId: null }, select: { id: true, title: true, slug: true }, orderBy: { title: "asc" } }),
  ]);
  if (!o) notFound();
  const t = o.trackedEvent;
  const first = o.locations[0];
  return (
    <div className="space-y-4">
      <OutbreakEditor o={JSON.parse(JSON.stringify(o))} diseases={diseases} others={others} />
      <TrackedEditor
        outbreakId={o.id}
        fallbackCenter={{ lat: first?.lat ?? 0, lng: first?.lng ?? 0 }}
        current={t ? { name: t.name, active: t.active, primary: t.primary, originAdmin1: t.originAdmin1, anchorTerms: parseTerms(t.anchorTerms), contextTerms: parseTerms(t.contextTerms), weakAnchorTerms: parseTerms(t.weakAnchorTerms), mapCenterLat: t.mapCenterLat, mapCenterLng: t.mapCenterLng, mapZoom: t.mapZoom } : null}
      />
    </div>
  );
}
