"use client";

// Main dashboard: the state of the tracked investigation at a glance, and whether there is evidence of wider spread.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, FlaskConical, MapPinned, Radio } from "lucide-react";
import { OutbreakMap } from "@/components/map/outbreak-map";
import { ClassificationBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { Ago } from "@/components/ui/time";
import { RISK_LABEL } from "@/lib/domain/enums";
import { cn, fmtUtc } from "@/lib/utils";
import type { TrackerDTO } from "@/lib/server/tracker";
import { CategoryChip, EventDates, FindingList, InvestigationLegend, MetricCard, ReliabilityBadge, SourceLink, SpreadBanner, TopicChips } from "./parts";
import { AsOfControl, HistoricalBanner } from "./as-of-control";
import { locationMarkers } from "./markers";

const REFRESH_MS = 60_000;

export function TrackerDashboard({ initial }: { initial: TrackerDTO }) {
  const [t, setT] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Live view refreshes itself so new verified developments appear without a reload.
  useEffect(() => {
    if (initial.asOf) return;
    const id = setInterval(() => {
      fetch("/api/tracker", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: TrackerDTO) => { setT(d); setError(null); })
        .catch((e: Error) => setError(`Could not refresh (${e.message}). Showing the last loaded state.`));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [initial.asOf]);
  const markers = useMemo(() => locationMarkers(t), [t]);
  const s = t.status;

  if (t.notYetReported || !s) {
    return (
      <main className="mx-auto max-w-[1600px] space-y-3 px-2 pb-10 pt-2 sm:px-3">
        {t.asOf && <HistoricalBanner asOf={t.asOf} />}
        <AsOfControl asOf={t.asOf} />
        <p className="panel p-6 text-sm text-ink-dim" data-testid="not-yet-reported">The {t.event.name} had not been publicly reported by {fmtUtc(t.asOf)}.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 px-2 pb-10 pt-2 sm:px-3" data-testid="tracker-dashboard">
      {t.asOf && <HistoricalBanner asOf={t.asOf} />}
      {error && <p className="rounded-md border border-warn/30 bg-warn/[0.06] px-3 py-2 text-xs text-warn" role="alert">{error}</p>}

      {/* ------------------------------------------------------------------ status */}
      <section className="panel p-4" data-testid="tracker-header">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5"><Radio className="h-3 w-3 text-accent" aria-hidden />Tracked investigation · {t.event.name} · {t.event.originLabel}</p>
          <AsOfControl asOf={t.asOf} />
        </div>
        <h1 className="mt-1.5 text-lg font-semibold leading-snug sm:text-xl" data-testid="tracker-title">{s.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="tracker-status" data-classification={s.classification}>
          <ClassificationBadge classification={s.classification} />
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-ink-dim">Pathogen: {s.pathogenStatusLabel}</span>
          <span className="text-ink-faint">First reported {fmtUtc(s.firstReportedAt, false)}{s.eventStartDate ? ` · onset ${fmtUtc(s.eventStartDate, false)}` : ""}</span>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-md border border-cls-investigation/30 bg-cls-investigation/[0.06] px-3 py-2 text-sm" data-testid="pathogen-statement">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-cls-investigation" aria-hidden />
          <span>{s.pathogenStatement}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-dim">{s.summary}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-md border border-line px-3 py-2" data-testid="last-verified-update">
            <p className="eyebrow mb-1">Last verified update</p>
            {s.lastVerifiedUpdate ? (
              <>
                <p className="font-medium">{s.lastVerifiedUpdate.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  <SourceLink source={s.lastVerifiedUpdate.source} attributedTo={s.lastVerifiedUpdate.attributedTo} /> · reported {fmtUtc(s.lastVerifiedUpdate.publishedAt)} (<Ago iso={s.lastVerifiedUpdate.publishedAt} />)
                </p>
              </>
            ) : (
              <p className="text-ink-faint">No verified update yet.</p>
            )}
            {s.lastVerifiedAt && <p className="mt-0.5 text-[11px] text-ink-faint">Record last checked by an analyst {fmtUtc(s.lastVerifiedAt)}.</p>}
          </div>
          <div className="rounded-md border border-line px-3 py-2" data-testid="last-status-change">
            <p className="eyebrow mb-1">Current status since</p>
            {s.lastStatusChange ? (
              <>
                <p className="font-medium">{fmtUtc(s.lastStatusChange.effectiveAt)}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{s.lastStatusChange.reason}</p>
              </>
            ) : <p className="text-ink-faint">—</p>}
          </div>
        </div>
      </section>

      <SpreadBanner spread={t.spread} originLabel={t.event.originLabel} />

      {/* ------------------------------------------------------------------ figures */}
      <section aria-label="Key figures" data-testid="tracker-metrics">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">Key figures</h2>
          <p className="text-[11px] text-ink-faint">Only verified official figures are headline numbers. Unverified reports are labelled. No rates or projections are calculated from these data.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{t.metrics.map((m) => <MetricCard key={m.key} m={m} />)}</div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------------ last 24 h + developments */}
        <div className="space-y-3">
          <section className="panel" data-testid="last-24h">
            <div className="panel-head"><h2 className="eyebrow">What changed in the last 24 hours</h2><span className="text-[10px] text-ink-faint">since {fmtUtc(t.last24h.since)}</span></div>
            {t.last24h.entries.length === 0 ? (
              <p className="px-3 py-3 text-xs text-ink-faint" data-testid="last-24h-empty">
                No new developments, figures, locations or publications in the last 24 hours.
                {t.developments[0] ? <> Latest development reported {fmtUtc(t.developments[0].publishedAt)}.</> : null}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {t.last24h.entries.map((e, i) => (
                  <li key={i} className="space-y-0.5 px-3 py-2 text-xs" data-testid="last-24h-entry">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="eyebrow">{e.type}</span>{e.sourceType && <SourceTypeBadge type={e.sourceType} />}{e.verificationStatus && <VerificationBadge status={e.verificationStatus} />}<span className="text-ink-faint">{fmtUtc(e.at)}</span></div>
                    {e.href ? <a href={e.href} className="hover:text-accent" {...(e.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{e.title}</a> : <p>{e.title}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" data-testid="developments">
            <div className="panel-head"><h2 className="eyebrow">Major developments</h2><Link href={t.asOf ? `/timeline?asOf=${encodeURIComponent(t.asOf)}` : "/timeline"} className="flex items-center gap-1 text-[11px] text-accent">Full timeline <ArrowRight className="h-3 w-3" /></Link></div>
            <ul className="divide-y divide-line">
              {t.developments.map((u) => (
                <li key={u.id} className="space-y-1 px-3 py-2 text-xs" data-testid="development">
                  <div className="flex flex-wrap items-center gap-1.5"><CategoryChip category={u.category} />{u.sourceType && <SourceTypeBadge type={u.sourceType} />}<VerificationBadge status={u.verificationStatus} /></div>
                  <p className="font-medium">{u.title}</p>
                  <p className="leading-snug text-ink-dim">{u.body}</p>
                  <p className="flex flex-wrap gap-x-2"><EventDates e={u} /><span className="text-[11px] text-ink-faint"><SourceLink source={u.source} attributedTo={u.attributedTo} /></span></p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ------------------------------------------------------------------ map + intel */}
        <div className="space-y-3">
          <section className="panel overflow-hidden" data-testid="tracker-mini-map">
            <div className="panel-head"><h2 className="eyebrow">Investigation locations</h2><Link href="/map" className="flex items-center gap-1 text-[11px] text-accent"><MapPinned className="h-3 w-3" />Live map <ArrowRight className="h-3 w-3" /></Link></div>
            <div className="relative h-72 sm:h-80">
              <OutbreakMap markers={markers} initialView={{ center: [t.event.map.lng, t.event.map.lat], zoom: t.event.map.zoom - 0.6 }} className="absolute inset-0" legend={<InvestigationLegend />} />
            </div>
          </section>

          <section className="panel" data-testid="targeted-intel">
            <div className="panel-head"><h2 className="eyebrow">Targeted intelligence</h2><Link href="/intelligence" className="flex items-center gap-1 text-[11px] text-accent">All reports <ArrowRight className="h-3 w-3" /></Link></div>
            <p className="border-b border-line px-3 py-1.5 text-[11px] text-ink-faint">
              Publications identified as being about this investigation (named places plus event-specific context). Possible pathogen, laboratory results, contacts, transmission and spread first.
              {t.pendingReview.tracked > 0 && <> <span data-testid="pending-review">{t.pendingReview.tracked} awaiting analyst review{t.pendingReview.material ? ` (${t.pendingReview.material} possible material change${t.pendingReview.material > 1 ? "s" : ""})` : ""}.</span></>}
            </p>
            {t.intel.length === 0 ? <p className="px-3 py-3 text-xs text-ink-faint">No publications yet.</p> : (
              <ul className="divide-y divide-line">
                {t.intel.map((a) => (
                  <li key={a.id} className="space-y-1 px-3 py-2 text-xs" data-testid="intel-item">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReliabilityBadge sourceType={a.sourceType} />
                      <VerificationBadge status={a.verificationStatus} />
                      {a.reviewStatus === "PENDING" && <span className="text-[10px] text-warn">awaiting review</span>}
                      <TopicChips topics={a.trackedTopics} />
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="block font-medium hover:text-accent">{a.title} <ExternalLink className="inline h-3 w-3" /></a>
                    <p className="text-[11px] text-ink-faint">{a.sourceName} · published {fmtUtc(a.publishedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">Unrelated infectious-disease news is kept in <Link href="/intelligence?scope=other" className="text-accent">Intelligence → Other news</Link> and <Link href="/global" className="text-accent">Global watch</Link>.</p>
          </section>
        </div>
      </div>

      {/* ------------------------------------------------------------------ evidence, kept apart */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="panel" aria-labelledby="h-hyp">
          <div className="panel-head"><h2 id="h-hyp" className="eyebrow">Possible pathogen — claims</h2></div>
          <p className="border-b border-line px-3 py-1.5 text-[11px] text-ink-faint">Statements about the cause. A disputed claim is not a finding.</p>
          <FindingList items={t.hypotheses} empty="No claims about the cause recorded." testId="hypotheses" />
        </section>
        <section className="panel" aria-labelledby="h-lab">
          <div className="panel-head"><h2 id="h-lab" className="eyebrow">Laboratory findings</h2></div>
          <p className="border-b border-line px-3 py-1.5 text-[11px] text-ink-faint">Reported test results, with their verification status.</p>
          <FindingList items={t.labFindings} empty="No laboratory results reported." testId="lab-findings" />
        </section>
        <section className="panel" aria-labelledby="h-alt">
          <div className="panel-head"><h2 id="h-alt" className="eyebrow">Alternative explanations &amp; unverified accounts</h2></div>
          <p className="border-b border-line px-3 py-1.5 text-[11px] text-ink-faint">Accounts not established by any authority. Shown so they can be tracked, not because they are true.</p>
          <FindingList items={t.alternatives} empty="None recorded." testId="alternatives" />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel" aria-labelledby="h-contra">
          <div className="panel-head"><h2 id="h-contra" className="eyebrow">Contradictions between statements and reporting</h2></div>
          <FindingList items={t.contradictions} empty="No contradictions recorded." testId="contradictions" />
        </section>
        <section className="panel" aria-labelledby="h-risk" data-testid="risk-assessments">
          <div className="panel-head"><h2 id="h-risk" className="eyebrow">Risk assessments</h2></div>
          {t.riskAssessments.length === 0 ? <p className="px-3 py-3 text-xs text-ink-faint">None published.</p> : (
            <ul className="divide-y divide-line">
              {t.riskAssessments.map((r) => (
                <li key={r.id} className="space-y-0.5 px-3 py-2 text-xs">
                  <p><span className="font-medium">{r.organization}</span> · {r.scope}: <span className={cn(r.level === "NOT_ASSESSED" ? "text-ink-faint" : "text-ink")}>{RISK_LABEL[r.level] ?? r.level}</span> <VerificationBadge status={r.verificationStatus} /></p>
                  <p className="text-ink-dim">{r.statement}</p>
                  <p className="text-[11px] text-ink-faint">{fmtUtc(r.publishedAt, false)} · <SourceLink source={r.source} attributedTo={r.organization} /></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-[11px] text-ink-faint">
        Full sourced record: <Link href={`/outbreaks/${t.event.slug}${t.asOf ? `?asOf=${encodeURIComponent(t.asOf)}` : ""}`} className="text-accent">{t.event.slug}</Link>. Data generated {fmtUtc(t.generatedAt)}{t.asOf ? "" : " · refreshes every minute"}.
      </p>
    </main>
  );
}
