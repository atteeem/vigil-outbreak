// Presentational pieces shared by the investigation dashboard, map and timeline. No data fetching here.
import { ExternalLink } from "lucide-react";
import { cn, fmtUtc } from "@/lib/utils";
import { formatCount } from "@/lib/domain/stats";
import { SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { TOPIC_LABEL, PRIORITY_TOPICS, type TrackedTopic } from "@/lib/tracked/relevance";
import { TIMELINE_CATEGORY_LABEL } from "@/lib/tracked/timeline";
import { CLASSIFICATION_HEX } from "@/lib/domain/enums";
import { PRECAUTION_HEX } from "@/components/map/marker-style";
import type { Finding, MetricState, TimelineEntry, TrackerMetric, TrackerDTO } from "@/lib/server/tracker";

export const STATE_LABEL: Record<MetricState, string> = {
  VERIFIED_OFFICIAL: "Verified official",
  UNVERIFIED: "Unverified report",
  DISPUTED: "Disputed",
  UNKNOWN: "Unknown",
};
const STATE_STYLE: Record<MetricState, string> = {
  VERIFIED_OFFICIAL: "text-ok border-ok/30 bg-ok/10",
  UNVERIFIED: "text-ink-dim border-line-strong bg-white/[0.03]",
  DISPUTED: "text-warn border-warn/35 bg-warn/10",
  UNKNOWN: "text-ink-faint border-line bg-transparent",
};

export function StateChip({ state }: { state: MetricState }) {
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", STATE_STYLE[state])} data-testid="metric-state">{STATE_LABEL[state]}</span>;
}

export function SourceLink({ source, attributedTo }: { source: { url: string; title: string; sourceName: string } | null; attributedTo?: string | null }) {
  if (!source) return <span>{attributedTo ?? "Unattributed"}</span>;
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-accent" title={source.title}>
      {attributedTo ?? source.sourceName}
      <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
    </a>
  );
}

export function MetricCard({ m }: { m: TrackerMetric }) {
  const value = m.state === "UNKNOWN" ? "Not reported" : formatCount(m.value, m.valueHigh);
  return (
    <div className="panel flex flex-col gap-1.5 p-3" data-testid={`metric-${m.key}`} data-state={m.state}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{m.label}</span>
        <StateChip state={m.state} />
      </div>
      <p className={cn("num text-2xl font-semibold leading-none", m.state === "UNKNOWN" ? "text-ink-faint" : m.state === "VERIFIED_OFFICIAL" ? "text-ink" : "text-ink-dim")} data-testid="metric-value">
        {m.state === "UNVERIFIED" || m.state === "DISPUTED" ? <span className="mr-1 text-sm font-normal">reported</span> : null}
        {value}
      </p>
      {m.key === "DEATHS" && m.value !== null && (
        <p className={cn("text-[11px]", m.deathCauseConfirmed ? "text-ink-dim" : "text-warn")} data-testid="death-cause">{m.deathCauseConfirmed ? "Cause laboratory-confirmed." : "Cause of death not laboratory-confirmed."}</p>
      )}
      <p className="text-[11px] leading-snug text-ink-faint">{m.explanation}</p>
      {m.state !== "UNKNOWN" && (
        <p className="text-[11px] text-ink-faint" data-testid="metric-source">
          Source: <SourceLink source={m.source} attributedTo={m.attributedTo} /> · reported {fmtUtc(m.reportedAt)}
          {m.asOfDate ? ` · figure as of ${fmtUtc(m.asOfDate, false)}` : ""}
          {m.scope ? ` · ${m.scope}` : ""}
        </p>
      )}
      {m.newerUnverified && (
        <p className="text-[11px] text-ink-dim" data-testid="metric-newer-unverified">
          Newer unverified report: {formatCount(m.newerUnverified.value, m.newerUnverified.valueHigh)} ({m.newerUnverified.attributedTo ?? "unattributed"}, {fmtUtc(m.newerUnverified.reportedAt)}). Not merged into the figure above.
        </p>
      )}
    </div>
  );
}

export function FindingList({ items, empty, testId }: { items: Finding[]; empty: string; testId: string }) {
  if (!items.length) return <p className="px-3 py-3 text-xs text-ink-faint" data-testid={testId}>{empty}</p>;
  return (
    <ul className="divide-y divide-line" data-testid={testId}>
      {items.map((f) => (
        <li key={f.id} className="space-y-1 px-3 py-2 text-xs" data-testid="finding">
          <div className="flex flex-wrap items-center gap-1.5"><SourceTypeBadge type={f.sourceType} /><VerificationBadge status={f.verificationStatus} /><span className="text-ink-faint">{fmtUtc(f.publishedAt, false)}</span></div>
          <p className="leading-snug">{f.text}</p>
          {f.conflictNote && <p className="text-warn">⚠ {f.conflictNote}</p>}
          <p className="text-[11px] text-ink-faint"><SourceLink source={f.source} attributedTo={f.attributedTo} /></p>
        </li>
      ))}
    </ul>
  );
}

export function TopicChips({ topics, className }: { topics: readonly string[]; className?: string }) {
  if (!topics.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {topics.map((t) => (
        <span key={t} data-testid="topic-chip" className={cn("rounded border px-1.5 py-px text-[10px] whitespace-nowrap", (PRIORITY_TOPICS as readonly string[]).includes(t) ? "border-accent/40 text-accent" : "border-line-strong text-ink-faint")}>
          {TOPIC_LABEL[t as TrackedTopic] ?? t}
        </span>
      ))}
    </span>
  );
}

/** Reliability of the publisher, independent of whether a specific claim has been verified. */
export function ReliabilityBadge({ sourceType }: { sourceType: string }) {
  return sourceType === "OFFICIAL" ? (
    <span className="rounded border border-ok/25 px-1.5 py-px text-[10px] text-ok" title="Published by a public-health authority or government body">Official authority</span>
  ) : (
    <span className="rounded border border-line-strong px-1.5 py-px text-[10px] text-ink-dim" title="Secondary reporting: may cite unnamed or unofficial sources">Media — secondary</span>
  );
}

export function SpreadBanner({ spread, originLabel }: { spread: TrackerDTO["spread"]; originLabel: string }) {
  const tone = spread.state === "SPREAD_VERIFIED" ? "border-danger/40 bg-danger/[0.06]" : "border-line-strong bg-white/[0.02]";
  return (
    <section className={cn("rounded-lg border px-4 py-3", tone)} data-testid="spread-status" data-state={spread.state}>
      <p className="eyebrow mb-1">Wider spread</p>
      <p className={cn("text-sm font-medium", spread.state === "SPREAD_VERIFIED" ? "text-danger" : "text-ink")}>{spread.headline}</p>
      <p className="mt-1 text-[11px] text-ink-faint">
        Based on analyst-verified case locations only. Quarantined or observed contacts are precautionary measures, not infections, and countries merely mentioned in reporting are never counted. Origin: {originLabel}.
      </p>
      {spread.unverified.length > 0 && (
        <p className="mt-1 text-[11px] text-warn" data-testid="spread-unverified">
          {spread.unverified.length} reported case location{spread.unverified.length > 1 ? "s" : ""} awaiting verification (not mapped, not counted): {spread.unverified.map((l) => l.name).join(", ")}.
        </p>
      )}
    </section>
  );
}

export function InvestigationLegend({ showOthers }: { showOthers?: boolean }) {
  const item = (label: string, el: React.ReactNode) => (
    <li className="flex items-center gap-2 text-ink-dim"><span className="flex h-4 w-4 items-center justify-center">{el}</span>{label}</li>
  );
  const inv = CLASSIFICATION_HEX.UNCONFIRMED_INVESTIGATION;
  const sus = CLASSIFICATION_HEX.SUSPECTED_OUTBREAK;
  const conf = CLASSIFICATION_HEX.CONFIRMED_LOCALIZED;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md border border-line bg-panel/90 px-2 py-1.5 text-[9.5px] backdrop-blur sm:px-2.5 sm:py-2 sm:text-[10.5px]" data-testid="investigation-legend">
      <ul className="space-y-1">
        {item("Investigation site", <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${inv}` }}><span className="h-1 w-1 rounded-full" style={{ background: inv }} /></span>)}
        {item("Suspected case", <span className="h-3 w-3 rounded-full" style={{ boxShadow: `inset 0 0 0 2.5px ${sus}` }} />)}
        {item("Laboratory-confirmed case", <span className="h-3 w-3 rounded-full" style={{ background: conf }} />)}
        {item("Precautionary measure — not an infection", <span className="h-4 w-4 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${PRECAUTION_HEX}`, background: `${PRECAUTION_HEX}12` }} />)}
        {showOthers && item("Other outbreaks (unrelated, faded)", <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/50" />)}
      </ul>
      <p className="mt-1.5 hidden max-w-[220px] border-t border-line pt-1.5 leading-snug text-ink-faint sm:block">Only analyst-verified locations are drawn. Coordinates are city-level unless stated.</p>
    </div>
  );
}

export function CategoryChip({ category }: { category: TimelineEntry["category"] }) {
  return <span className="rounded border border-line-strong px-1.5 py-px text-[10px] text-ink-dim whitespace-nowrap" data-testid="category-chip">{TIMELINE_CATEGORY_LABEL[category]}</span>;
}

/** Occurred vs reported — always both, so readers can tell late reporting from late events. */
export function EventDates({ e }: { e: Pick<TimelineEntry, "occurredAt" | "publishedAt"> }) {
  return (
    <span className="text-[11px] text-ink-faint" data-testid="event-dates">
      <span data-testid="occurred-at">Occurred: {e.occurredAt ? fmtUtc(e.occurredAt, false) : "date not reported"}</span>
      {" · "}
      <span data-testid="reported-at">Reported: {fmtUtc(e.publishedAt)}</span>
    </span>
  );
}
