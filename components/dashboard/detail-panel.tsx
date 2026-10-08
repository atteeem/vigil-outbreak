"use client";

import Link from "next/link";
import { ArrowUpRight, ExternalLink, MapPin } from "lucide-react";
import type { OutbreakDetailDTO } from "@/lib/server/queries";
import { ClassificationBadge, PathogenStatusText, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { CaseStats } from "@/components/outbreak/case-stats";
import { Time } from "@/components/ui/time";
import { RISK_LABEL } from "@/lib/domain/enums";
import { EmptyState } from "@/components/ui/empty-state";

export function DetailPanel({ detail, loading, asOf }: { detail: OutbreakDetailDTO | { notYetReported: true; title: string; firstReportedAt: string } | null; loading: boolean; asOf: string | null }) {
  if (!detail) {
    return <EmptyState title={loading ? "Loading…" : "Select an event"} className="m-3">{loading ? null : "Click a marker on the map or an item in the list to see its classification, evidence and sources."}</EmptyState>;
  }
  if (detail.notYetReported) {
    return <EmptyState title="Not yet reported at this time" className="m-3">“{detail.title}” was first publicly reported <Time iso={detail.firstReportedAt} />. Move the timeline forward to see it.</EmptyState>;
  }
  const d = detail;
  const pathogen = d.disease ?? d.suspectedDisease;
  return (
    <div className="flex flex-col gap-4 p-3" data-testid="detail-panel">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <ClassificationBadge classification={d.classification} />
          {asOf && <span className="text-[10px] uppercase tracking-wide text-warn">as known <Time iso={asOf} /></span>}
        </div>
        <h2 className="mt-2 text-[15px] font-semibold leading-snug" data-testid="detail-title">{d.title}</h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-dim"><MapPin className="h-3 w-3" />{d.locations.map((l) => l.name).join(" · ") || d.countryName}, {d.countryName}</p>
      </div>

      <section>
        <p className="eyebrow mb-1.5">Pathogen identification</p>
        <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs">
          <PathogenStatusText status={d.pathogenStatus} className="font-medium" />
          {pathogen && (
            <p className="mt-1 text-ink-dim">
              {d.disease ? "Confirmed: " : d.pathogenStatus === "RULED_OUT" ? "Ruled out: " : "Under consideration (not confirmed): "}
              <span className="text-ink">{pathogen.name}</span>
              {pathogen.pathogen ? <> — <i>{pathogen.pathogen}</i> ({pathogen.pathogenType.toLowerCase()})</> : null}
            </p>
          )}
          {!pathogen && <p className="mt-1 text-ink-dim">No causative agent identified.</p>}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-1.5">Case statistics</p>
        <CaseStats cases={d.cases} compact />
      </section>

      <section>
        <p className="eyebrow mb-1.5">Official risk assessments</p>
        {d.riskAssessments.length === 0 ? <p className="text-xs text-ink-faint">None published.</p> : (
          <ul className="space-y-1.5">
            {d.riskAssessments.map((r) => (
              <li key={r.id} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.organization}</span><VerificationBadge status={r.verificationStatus} /></div>
                <p className="text-ink-dim">{r.scope}: <span className="text-ink">{RISK_LABEL[r.level] ?? r.level}</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="eyebrow mb-1.5">Event timeline</p>
        <ol className="relative space-y-2 border-l border-line pl-3">
          {d.chronology.slice(-6).map((u) => (
            <li key={u.id} className="text-xs">
              <span className="absolute -left-[3.5px] mt-1.5 h-1.5 w-1.5 rounded-full bg-ink-faint" />
              <p className="text-[10px] text-ink-faint num"><Time iso={u.occurredAt ?? u.publishedAt} withTime={false} /> {u.occurredAt ? "" : "(published)"}</p>
              <p className="leading-snug">{u.title}</p>
              <div className="mt-0.5 flex gap-1"><SourceTypeBadge type={u.sourceType} /><VerificationBadge status={u.verificationStatus} /></div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <p className="eyebrow mb-1.5">Sources ({d.sources.length})</p>
        <ul className="space-y-1">
          {d.sources.slice(0, 6).map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-xs text-ink-dim hover:text-ink">
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2"><span className="text-ink">{s.sourceName}</span> — {s.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <Link href={`/outbreaks/${d.slug}${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ""}`} className="btn btn-accent justify-center" data-testid="open-outbreak-page">
        Open full investigation record <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
