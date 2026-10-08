import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight, ExternalLink, History, MapPin } from "lucide-react";
import { getOutbreakDetail, type OutbreakDetailDTO } from "@/lib/server/queries";
import { parseAsOf } from "@/lib/domain/timeline";
import { CLASSIFICATION_LABEL, METRIC_LABEL, PATHOGEN_STATUS_LABEL, RISK_LABEL, UPDATE_KIND_LABEL, type Classification, type Metric, type PathogenStatus } from "@/lib/domain/enums";
import { formatCount } from "@/lib/domain/stats";
import { ClassificationBadge, PathogenStatusText, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { CaseStats } from "@/components/outbreak/case-stats";
import { SeriesChart } from "@/components/outbreak/series-chart";
import { OutbreakMap } from "@/components/map/outbreak-map";
import { markersFor } from "@/lib/map/markers";
import { Time } from "@/components/ui/time";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtUtc } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await getOutbreakDetail(slug, null);
  return { title: d && !d.notYetReported ? d.title : "Outbreak" };
}

function Section({ title, id, children, count }: { title: string; id: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="panel" aria-labelledby={id} data-testid={`section-${id}`}>
      <div className="panel-head">
        <h2 id={id} className="eyebrow">{title}</h2>
        {count !== undefined && <span className="num text-[11px] text-ink-faint">{count}</span>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

type Claim = OutbreakDetailDTO["confirmedFacts"][number];

function SourceLink({ source }: { source: { url: string; sourceName: string; title: string } | null }) {
  if (!source) return <span className="text-ink-faint">no linked publication</span>;
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-accent" title={source.title}>
      {source.sourceName} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function ClaimList({ claims, empty }: { claims: Claim[]; empty: string }) {
  if (claims.length === 0) return <p className="text-xs text-ink-faint">{empty}</p>;
  return (
    <ul className="space-y-2">
      {claims.map((c) => (
        <li key={c.id} className="rounded-md border border-line bg-surface px-3 py-2 text-[13px]">
          <p className="leading-snug">{c.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
            <SourceTypeBadge type={c.sourceType} />
            <VerificationBadge status={c.verificationStatus} />
            {c.attributedTo && <span className="text-ink-dim">{c.attributedTo}</span>}
            <span>· <Time iso={c.publishedAt} withTime={false} /></span>
            <span>· <SourceLink source={c.source} /></span>
          </div>
          {c.conflictNote && <p className="mt-1.5 flex gap-1.5 text-[11.5px] text-warn"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{c.conflictNote}</p>}
        </li>
      ))}
    </ul>
  );
}

export default async function OutbreakPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const asOfRaw = Array.isArray(sp.asOf) ? sp.asOf[0] : sp.asOf;
  const asOf = parseAsOf(asOfRaw);
  const d = await getOutbreakDetail(slug, asOf);
  if (!d) notFound();
  const asOfIso = asOf?.toISOString() ?? null;

  if (d.notYetReported) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="Not yet publicly reported at the selected time">
          “{d.title}” was first reported <Time iso={d.firstReportedAt} />. <Link className="text-accent" href={`/outbreaks/${slug}`}>View the live record</Link>.
        </EmptyState>
      </main>
    );
  }

  const markers = markersFor([d]);
  const first = d.locations[0];
  const regional = first ? { center: [first.lng, first.lat] as [number, number], zoom: first.precision === "COUNTRY" ? 3.6 : 7.2 } : undefined;
  const deathNotAttributed = d.cases.deaths !== null && d.cases.deathsCauseConfirmed === false;
  const pathogen = d.diseaseFull ?? d.suspectedDiseaseFull;
  const metricRows = d.observations;

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-12 pt-3 sm:px-4" data-testid="outbreak-page">
      <nav className="mb-3 flex items-center gap-1 text-[11px] text-ink-faint" aria-label="Breadcrumb">
        <Link href="/outbreaks" className="hover:text-ink">Outbreaks</Link><ChevronRight className="h-3 w-3" /><span className="truncate text-ink-dim">{d.countryName}</span>
      </nav>

      {asOf && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-xs text-warn" role="status" data-testid="historical-banner">
          <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Historical record as publicly known at {fmtUtc(asOf)}. Later reports, verdicts and reclassifications are hidden.</span>
          <Link href={`/outbreaks/${slug}`} className="btn py-0.5">View current record</Link>
        </div>
      )}
      {d.mergedInto && (
        <div className="mb-3 rounded-md border border-line-strong bg-raised px-3 py-2 text-xs">This record was merged into <Link className="text-accent" href={`/outbreaks/${d.mergedInto.slug}`}>{d.mergedInto.title}</Link>.</div>
      )}

      <header className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationBadge classification={d.classification} />
            <span className="text-xs text-ink-dim">Pathogen: <PathogenStatusText status={d.pathogenStatus} /></span>
          </div>
          <h1 className="mt-2 max-w-4xl text-xl font-semibold leading-tight tracking-tight sm:text-2xl" data-testid="outbreak-title">{d.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-dim">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.locations.map((l) => l.name).join(" · ")}{d.locations.length ? ", " : ""}{d.countryName}</span>
            <span>First reported <Time iso={d.firstReportedAt} withTime={false} /></span>
            {d.eventStartDate && <span>Event start <Time iso={d.eventStartDate} withTime={false} /></span>}
            <span data-testid="last-verified">Last verified update: {d.lastVerifiedAt ? <Time iso={d.lastVerifiedAt} /> : asOf ? "see chronology" : "—"}</span>
            {d.resolvedAt && <span>Resolved <Time iso={d.resolvedAt} withTime={false} /></span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-lg border border-line bg-line text-xs sm:w-[340px]">
          <div className="bg-panel px-3 py-2"><p className="eyebrow">Classification</p><p className="mt-0.5">{CLASSIFICATION_LABEL[d.classification as Classification]}</p></div>
          <div className="bg-panel px-3 py-2"><p className="eyebrow">Pathogen status</p><p className="mt-0.5">{PATHOGEN_STATUS_LABEL[d.pathogenStatus as PathogenStatus]}</p></div>
        </div>
      </header>

      {deathNotAttributed && (
        <div className="mb-4 flex gap-2 rounded-lg border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13px]" data-testid="death-attribution-notice">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p><span className="font-medium text-warn">A confirmed death is not a confirmed {pathogen && d.suspectedDiseaseFull ? `${pathogen.name.toLowerCase()} death` : "pathogen-attributed death"}.</span> <span className="text-ink-dim">The death is officially reported; its cause has not been laboratory-attributed{d.suspectedDiseaseFull ? ` to ${d.suspectedDiseaseFull.name.toLowerCase()} (${d.suspectedDiseaseFull.pathogen}, a ${d.suspectedDiseaseFull.pathogenType.toLowerCase()})` : ""}.</span></p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Current assessment" id="summary">
            <p className="text-[13.5px] leading-relaxed text-ink" data-testid="outbreak-summary">{d.summary}</p>
          </Section>

          <Section title="Case statistics" id="cases">
            <CaseStats cases={d.cases} />
            <p className="mt-2 text-[11px] text-ink-faint">Headline figures use only official, verified, cumulative observations — never summed across sources or reporting periods. Unknown values are shown as “Not reported”.</p>
          </Section>

          <Section title="Event chronology" id="chronology" count={d.chronology.length}>
            {d.chronology.length === 0 ? <p className="text-xs text-ink-faint">No developments recorded.</p> : (
              <ol className="relative space-y-4 border-l border-line pl-4">
                {d.chronology.map((u) => (
                  <li key={u.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-bg bg-ink-faint" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
                      <span className="num text-ink-dim">{u.occurredAt ? <>Occurred <Time iso={u.occurredAt} withTime={false} /></> : "Date of occurrence not stated"}</span>
                      <span>· Published <Time iso={u.publishedAt} /></span>
                      <span>· {UPDATE_KIND_LABEL[u.kind] ?? u.kind}</span>
                    </div>
                    <p className="mt-0.5 text-[13.5px] font-medium">{u.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{u.body}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                      <SourceTypeBadge type={u.sourceType} /><VerificationBadge status={u.verificationStatus} />
                      {u.attributedTo && <span>{u.attributedTo}</span>}
                      {u.source && <span>· <SourceLink source={u.source} /></span>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <div className="grid gap-3 xl:grid-cols-2">
            <Section title="Confirmed facts" id="confirmed-facts" count={d.confirmedFacts.length}>
              <ClaimList claims={d.confirmedFacts} empty="No verified claims yet." />
            </Section>
            <Section title="Unverified reports" id="unverified" count={d.unverifiedReports.length}>
              <ClaimList claims={d.unverifiedReports} empty="No unverified reports recorded." />
            </Section>
          </div>

          <Section title="Contradictory information & provenance" id="contradictions" count={d.contradictions.length}>
            <ClaimList claims={d.contradictions} empty="No conflicting claims recorded." />
          </Section>

          <div className="grid gap-3 xl:grid-cols-2">
            <Section title="Official statements" id="statements" count={d.officialStatements.length}>
              {d.officialStatements.length === 0 ? <p className="text-xs text-ink-faint">None recorded.</p> : (
                <ul className="space-y-2">
                  {d.officialStatements.map((u) => (
                    <li key={u.id} className="text-[13px]">
                      <p className="font-medium">{u.attributedTo}</p>
                      <p className="text-ink-dim">{u.body}</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint"><Time iso={u.publishedAt} /> · <SourceLink source={u.source} /></p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Reported precautionary measures" id="measures" count={d.measures.length}>
              {d.measures.length === 0 ? <p className="text-xs text-ink-faint">None recorded.</p> : (
                <ul className="space-y-2">
                  {d.measures.map((u) => (
                    <li key={u.id} className="text-[13px]">
                      <p className="font-medium">{u.title}</p>
                      <p className="text-ink-dim">{u.body}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint"><SourceTypeBadge type={u.sourceType} /><VerificationBadge status={u.verificationStatus} /><span>{u.attributedTo}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Dated observations (all provenance)" id="observations" count={metricRows.length}>
            {metricRows.length === 0 ? <p className="text-xs text-ink-faint">No figures have been reported.</p> : (
              <div className="-mx-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12px]">
                  <thead className="text-ink-faint">
                    <tr className="border-b border-line">
                      <th className="px-3 py-1.5 font-medium">Metric</th><th className="px-3 py-1.5 font-medium">Value</th><th className="px-3 py-1.5 font-medium">Refers to</th><th className="px-3 py-1.5 font-medium">Reported</th><th className="px-3 py-1.5 font-medium">Provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map((o) => (
                      <tr key={o.id} className="border-b border-line/60 align-top">
                        <td className="px-3 py-2">{METRIC_LABEL[o.metric as Metric] ?? o.metric}{o.metric === "DEATHS" && o.deathCauseConfirmed === false && <span className="block text-[10.5px] text-warn">cause not confirmed</span>}</td>
                        <td className="num px-3 py-2">{formatCount(o.value, o.valueHigh)}</td>
                        <td className="px-3 py-2 text-ink-dim">{o.asOfDate ? fmtUtc(o.asOfDate, false) : "—"}{o.scope ? <span className="block text-[10.5px] text-ink-faint">{o.scope}</span> : null}</td>
                        <td className="px-3 py-2 text-ink-dim">{fmtUtc(o.reportedAt, false)}</td>
                        <td className="px-3 py-2"><div className="flex flex-wrap gap-1"><SourceTypeBadge type={o.sourceType} /><VerificationBadge status={o.verificationStatus} /></div><span className="mt-0.5 block text-[10.5px] text-ink-faint">{o.attributedTo}</span>{o.notes && <span className="block text-[10.5px] text-ink-faint">{o.notes}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Classification history" id="status-history" count={d.statusHistory.length}>
            <ol className="space-y-2">
              {[...d.statusHistory].reverse().map((s) => (
                <li key={s.id} className="text-[13px]">
                  <p className="text-[11px] text-ink-faint"><Time iso={s.effectiveAt} /></p>
                  <p>{s.from ? `${CLASSIFICATION_LABEL[s.from as Classification]} → ` : ""}<span className="font-medium">{CLASSIFICATION_LABEL[s.to as Classification]}</span> · pathogen {s.fromPathogen ? `${PATHOGEN_STATUS_LABEL[s.fromPathogen as PathogenStatus].toLowerCase()} → ` : ""}{PATHOGEN_STATUS_LABEL[s.toPathogen as PathogenStatus].toLowerCase()}</p>
                  <p className="text-ink-dim">{s.reason}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <section className="panel overflow-hidden" aria-label="Regional map">
            <div className="panel-head"><span className="eyebrow">Location</span><span className="text-[10.5px] text-ink-faint">{first?.precision === "COUNTRY" ? "Country-level marker" : "City-level markers"}</span></div>
            <OutbreakMap markers={markers} selectedSlug={d.slug} initialView={regional} className="h-72" showLegend={false} />
            <ul className="divide-y divide-line text-xs">
              {d.locations.map((l) => (
                <li key={l.name} className="px-3 py-2">
                  <p className="font-medium">{l.name}{l.admin1 ? `, ${l.admin1}` : ""}</p>
                  <p className="text-ink-faint">{l.role.replace(/_/g, " ").toLowerCase()} · {l.precision.toLowerCase()} precision · {l.lat.toFixed(3)}, {l.lng.toFixed(3)}</p>
                  {l.notes && <p className="text-ink-dim">{l.notes}</p>}
                </li>
              ))}
            </ul>
          </section>

          <Section title="Pathogen" id="pathogen">
            <p className="text-[13px]"><PathogenStatusText status={d.pathogenStatus} className="font-medium" /></p>
            {pathogen ? (
              <div className="mt-1.5 text-[13px] text-ink-dim">
                <p>{d.diseaseFull ? "Confirmed" : d.pathogenStatus === "RULED_OUT" ? "Ruled out" : "Under consideration, not confirmed"}: <span className="text-ink">{pathogen.name}</span></p>
                {pathogen.pathogen && <p>Agent: <i className="text-ink">{pathogen.pathogen}</i> — a {pathogen.pathogenType.toLowerCase()}</p>}
                {pathogen.description && <p className="mt-1.5 text-[12px] leading-relaxed">{pathogen.description}</p>}
              </div>
            ) : <p className="mt-1 text-[13px] text-ink-dim">No causative agent identified.</p>}
          </Section>

          <Section title="WHO / ECDC & official risk assessments" id="risk" count={d.riskAssessments.length}>
            {d.riskAssessments.length === 0 ? <p className="text-xs text-ink-faint">No assessments published.</p> : (
              <ul className="space-y-2">
                {d.riskAssessments.map((r) => (
                  <li key={r.id} className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.organization}</span><VerificationBadge status={r.verificationStatus} /></div>
                    <p className="text-ink-dim">{r.scope} — <span className="text-ink">{RISK_LABEL[r.level] ?? r.level}</span></p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">{r.statement}</p>
                    <p className="mt-1 text-[11px] text-ink-faint"><Time iso={r.publishedAt} withTime={false} /> · <SourceLink source={r.source} /></p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Trend (official, verified)" id="trend">
            <SeriesChart
              testId="outbreak-series"
              lines={[
                { key: "c", name: "Confirmed cases", color: "#f2b84b", points: d.series.CONFIRMED_CASES },
                { key: "s", name: "Suspected cases", color: "#c79bff", points: d.series.SUSPECTED_CASES },
                { key: "d", name: "Deaths", color: "#ef6a5a", points: d.series.DEATHS },
              ]}
              height={200}
            />
          </Section>

          <Section title="Sources" id="sources" count={d.sources.length}>
            <ul className="space-y-2">
              {d.sources.map((s) => (
                <li key={s.id} className="text-[12.5px]">
                  <a href={s.url} target="_blank" rel="noreferrer" className="group block">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint"><SourceTypeBadge type={s.sourceType} />{s.sourceName} · <Time iso={s.publishedAt} withTime={false} /></span>
                    <span className="mt-0.5 line-clamp-2 text-ink-dim group-hover:text-accent">{s.title} <ExternalLink className="inline h-3 w-3" /></span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            Record view <Link className="underline" href={`/outbreaks/${slug}?asOf=${encodeURIComponent(asOfIso ?? new Date(new Date(d.firstReportedAt).getTime() + 86400_000).toISOString())}`}>as of an earlier time</Link> uses only information published by then.
          </p>
        </aside>
      </div>
    </main>
  );
}
