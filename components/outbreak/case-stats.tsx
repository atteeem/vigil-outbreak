import { METRIC_LABEL, type Metric } from "@/lib/domain/enums";
import { formatCount, type CaseSummary } from "@/lib/domain/stats";
import { cn } from "@/lib/utils";

/** Headline figures: official + verified only. Unknown renders as "Not reported", never 0. Unverified/media
 * figures are shown in a separate, labelled block and never merged. */
export function CaseStats({ cases, compact = false }: { cases: CaseSummary; compact?: boolean }) {
  const cells: { label: string; value: number | null; note?: string; testId: string }[] = [
    { label: "Confirmed cases", value: cases.confirmedCases, testId: "stat-confirmed" },
    { label: "Probable", value: cases.probableCases, testId: "stat-probable" },
    { label: "Suspected", value: cases.suspectedCases, testId: "stat-suspected" },
    {
      label: "Deaths",
      value: cases.deaths,
      note: cases.deaths !== null ? (cases.deathsCauseConfirmed ? "cause lab-attributed" : "cause not confirmed") : undefined,
      testId: "stat-deaths",
    },
  ];
  const unverified = Object.entries(cases.reportedUnverified) as [Metric, NonNullable<CaseSummary["reportedUnverified"][Metric]>][];
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-px overflow-hidden rounded-lg border border-line bg-line", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {cells.map((c) => (
          <div key={c.label} className="bg-panel px-3 py-2" data-testid={c.testId}>
            <p className="eyebrow">{c.label}</p>
            <p className={cn("num mt-0.5", c.value === null ? "text-xs text-ink-faint" : "text-lg font-semibold")}>{formatCount(c.value)}</p>
            {c.note && <p className={cn("text-[10px]", cases.deathsCauseConfirmed ? "text-ink-faint" : "text-warn")}>{c.note}</p>}
          </div>
        ))}
      </div>
      {cases.underObservation !== null && (
        <p className="text-[11px] text-ink-dim">Under observation (official): <span className="num text-ink">{formatCount(cases.underObservation)}</span> — people monitored, not infections.</p>
      )}
      {unverified.length > 0 && (
        <div className="rounded-md border border-warn/25 bg-warn/[0.05] px-3 py-2" data-testid="unverified-figures">
          <p className="eyebrow text-warn/80">Reported, not verified — excluded from figures above</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-ink-dim">
            {unverified.map(([m, v]) => (
              <li key={m}>
                <span className="text-ink">{METRIC_LABEL[m]}:</span> <span className="num">{formatCount(v.value, v.valueHigh)}</span>
                {v.attributedTo ? <span className="text-ink-faint"> · {v.attributedTo}</span> : null}
                {m === "UNDER_OBSERVATION" ? <span className="text-ink-faint"> (observation ≠ infection)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
