import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { listFeed } from "@/lib/server/queries";
import { readDashboardParams, one } from "@/lib/server/page-params";
import { prisma } from "@/lib/db";
import { COUNTRIES } from "@/lib/geo/countries";
import { ContentTypeBadge, OriginBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { Time } from "@/components/ui/time";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Intelligence" };

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { filters, asOf, query } = readDashboardParams(sp);
  const st = one(sp.sourceType);
  const sourceType = st === "OFFICIAL" || st === "MEDIA" ? st : null;
  const includeAllTypes = one(sp.types) === "all";
  const [items, diseases] = await Promise.all([listFeed(asOf, { ...query, sourceType, includeAllTypes }, 150), prisma.disease.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } })]);
  return (
    <main className="mx-auto max-w-[1100px] px-3 pb-12 pt-4 sm:px-4">
      <h1 className="text-xl font-semibold tracking-tight">Intelligence feed</h1>
      <p className="mb-4 text-xs text-ink-dim">Ingested and analyst-entered publications. Official publications appear immediately (marked “awaiting review” until an analyst reviews them); media reports appear only after review. Each item keeps its original source and is labelled “Seeded” (hand-compiled initial data) or “Auto-ingested” (retrieved by the pipeline). Guidance, podcasts, corporate and general publications are hidden unless you choose “All publication types”; they are never linked to outbreaks or counted as cases.</p>
      <form method="get" className="panel mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <input name="q" defaultValue={filters.q} className="field" placeholder="Search headlines…" aria-label="Search" />
        <select name="disease" defaultValue={filters.disease} className="field" aria-label="Disease"><option value="">All pathogens</option><option value="unknown">Unknown cause / unspecified</option>{diseases.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select>
        <select name="country" defaultValue={filters.country} className="field" aria-label="Country"><option value="">All countries</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        <select name="sourceType" defaultValue={sourceType ?? ""} className="field" aria-label="Source type"><option value="">Official + media</option><option value="OFFICIAL">Official only</option><option value="MEDIA">Media only</option></select>
        <select name="types" defaultValue={includeAllTypes ? "all" : ""} className="field" aria-label="Publication types" data-testid="feed-types"><option value="">Outbreak-related only</option><option value="all">All publication types</option></select>
        <div className="flex gap-2"><button className="btn btn-accent" type="submit">Apply</button><Link className="btn" href="/intelligence">Reset</Link></div>
      </form>
      {items.length === 0 ? <EmptyState title="No reports match" testId="feed-empty">Nothing has been ingested for these filters yet.</EmptyState> : (
        <ul className="panel divide-y divide-line" data-testid="feed-list">
          {items.map((i) => (
            <li key={i.id} className="px-4 py-3" data-testid="feed-item">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                <SourceTypeBadge type={i.sourceType} />
                <VerificationBadge status={i.verificationStatus} />
                <OriginBadge origin={i.origin} fetchedAt={i.fetchedAt} />
                <ContentTypeBadge type={i.contentType} relevant={i.outbreakRelevant} />
                {i.reviewStatus === "PENDING" && <span className="rounded border border-warn/30 px-1.5 text-[10px] uppercase tracking-wide text-warn">awaiting review</span>}
                <span className="text-ink-dim">{i.organization}</span>· published <Time iso={i.publishedAt} />{i.origin === "INGESTED" && <> · retrieved <Time iso={i.fetchedAt} /></>}
              </div>
              {i.outbreak ? (
                <Link href={`/outbreaks/${i.outbreak.slug}`} className="mt-1 block text-[14px] font-medium leading-snug hover:text-accent">{i.title} <ArrowUpRight className="inline h-3.5 w-3.5" /></Link>
              ) : (
                <a href={i.url} target="_blank" rel="noreferrer" className="mt-1 block text-[14px] font-medium leading-snug hover:text-accent">{i.title} <ExternalLink className="inline h-3.5 w-3.5" /></a>
              )}
              {i.summary && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-ink-dim">{i.summary}</p>}
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                <span>{i.countries.map((c) => c.name).join(", ") || "Country not stated"}</span>
                <span>{i.diseases.length ? i.diseases.map((d) => d.name).join(", ") : i.unknownCause ? "Unknown cause (as reported)" : "Pathogen not specified"}</span>
                {i.outbreak ? <span>Linked: <Link className="text-ink-dim hover:text-accent" href={`/outbreaks/${i.outbreak.slug}`}>{i.outbreak.title}</Link></span> : <span>Not linked to an outbreak</span>}
                <a className="hover:text-ink" href={i.url} target="_blank" rel="noreferrer">Original publication ↗</a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
