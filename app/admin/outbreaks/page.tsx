import Link from "next/link";
import { prisma } from "@/lib/db";
import { ClassificationBadge } from "@/components/ui/badges";
import { CreateOutbreakForm } from "@/components/admin/create-outbreak-form";
import { fmtUtc } from "@/lib/utils";

export default async function AdminOutbreaks() {
  const [outbreaks, diseases] = await Promise.all([
    prisma.outbreak.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { articles: true, observations: true, claims: true } }, mergedInto: { select: { title: true } } } }),
    prisma.disease.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <main className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Outbreak records</h1>
        <ul className="panel divide-y divide-line" data-testid="admin-outbreaks">
          {outbreaks.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/outbreaks/${o.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-hover">
                <ClassificationBadge classification={o.classification} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{o.title}</span>
                <span className={o.published ? "text-[11px] text-ok" : "text-[11px] text-warn"}>{o.mergedInto ? `merged → ${o.mergedInto.title}` : o.published ? "published" : "unpublished"}</span>
                <span className="text-[11px] text-ink-faint">{o._count.articles} art · {o._count.observations} obs · {o._count.claims} claims · {fmtUtc(o.updatedAt, false)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section><h2 className="mb-3 text-lg font-semibold">New record</h2><CreateOutbreakForm diseases={diseases} /></section>
    </main>
  );
}
