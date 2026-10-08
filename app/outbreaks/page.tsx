import type { Metadata } from "next";
import Link from "next/link";
import { listOutbreaks } from "@/lib/server/queries";
import { readDashboardParams } from "@/lib/server/page-params";
import { prisma } from "@/lib/db";
import { CLASSIFICATIONS, CLASSIFICATION_LABEL } from "@/lib/domain/enums";
import { formatCount } from "@/lib/domain/stats";
import { ClassificationBadge, PathogenStatusText } from "@/components/ui/badges";
import { Time } from "@/components/ui/time";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outbreaks" };

export default async function OutbreaksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filters, asOf, query } = readDashboardParams(await searchParams);
  const [outbreaks, all, diseases] = await Promise.all([listOutbreaks(asOf, query), listOutbreaks(asOf, {}), prisma.disease.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } })]);
  const countries = [...new Map(all.map((o) => [o.countryCode, o.countryName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <main className="mx-auto max-w-[1400px] px-3 pb-12 pt-4 sm:px-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Outbreaks & investigations</h1>
          <p className="text-xs text-ink-dim">Published records, including resolved investigations. Classification reflects laboratory evidence, not severity.</p>
        </div>
        <p className="num text-xs text-ink-faint" data-testid="outbreaks-count">{outbreaks.length} of {all.length} records</p>
      </div>
      <form className="panel mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" method="get" role="search">
        <input name="q" defaultValue={filters.q} className="field" placeholder="Search title, place, pathogen…" aria-label="Search" />
        <select name="disease" defaultValue={filters.disease} className="field" aria-label="Disease">
          <option value="">All diseases</option>
          <option value="unknown">Unconfirmed / unknown cause</option>
          {diseases.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
        </select>
        <select name="country" defaultValue={filters.country} className="field" aria-label="Country">
          <option value="">All countries</option>
          {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <select name="status" defaultValue={filters.status[0] ?? ""} className="field" aria-label="Status">
          <option value="">All statuses</option>
          {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
        </select>
        <select name="since" defaultValue={filters.since} className="field" aria-label="Last activity">
          <option value="">Any time</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option>
        </select>
        <div className="flex gap-2"><button className="btn btn-accent" type="submit">Apply</button><Link href="/outbreaks" className="btn">Reset</Link></div>
      </form>
      {outbreaks.length === 0 ? <EmptyState title="No records match these filters" /> : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="outbreak-cards">
          {outbreaks.map((o) => (
            <li key={o.slug}>
              <Link href={`/outbreaks/${o.slug}`} className="panel flex h-full flex-col gap-2 p-3 transition-colors hover:border-line-strong hover:bg-raised" data-testid={`outbreak-card-${o.slug}`}>
                <div className="flex items-center justify-between gap-2"><ClassificationBadge classification={o.classification} /><span className="text-[11px] text-ink-faint">{o.countryName}</span></div>
                <p className="text-[14px] font-medium leading-snug">{o.title}</p>
                <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-dim">{o.summary}</p>
                <div className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-2 text-[11px]">
                  <div><p className="eyebrow">Confirmed</p><p className="num">{formatCount(o.cases.confirmedCases)}</p></div>
                  <div><p className="eyebrow">Deaths</p><p className="num">{formatCount(o.cases.deaths)}</p></div>
                  <div><p className="eyebrow">Pathogen</p><PathogenStatusText status={o.pathogenStatus} className="text-[11px]" /></div>
                </div>
                <p className="text-[10.5px] text-ink-faint">{o.disease?.name ?? (o.suspectedDisease ? `${o.suspectedDisease.name} suspected, not confirmed` : "Unknown cause")} · last activity <Time iso={o.lastActivityAt} withTime={false} /> · {o.articleCount} sources</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
