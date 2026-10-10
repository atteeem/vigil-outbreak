"use client";

// Chronology of the tracked investigation. Ordered by when things happened (falling back to when they were
// reported if the event date is unknown), always showing both dates; filterable by category; each entry links to
// the state of knowledge right after it was reported.
import Link from "next/link";
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { ClassificationBadge, SourceTypeBadge, VerificationBadge } from "@/components/ui/badges";
import { cn, fmtUtc } from "@/lib/utils";
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABEL, type TimelineCategory } from "@/lib/tracked/timeline";
import type { TrackerDTO } from "@/lib/server/tracker";
import { CategoryChip, EventDates, SourceLink } from "./parts";
import { AsOfControl, HistoricalBanner } from "./as-of-control";

export function TimelineView({ t }: { t: TrackerDTO }) {
  const [active, setActive] = useState<Set<TimelineCategory>>(new Set());
  const present = useMemo(() => TIMELINE_CATEGORIES.filter((c) => t.timeline.some((e) => e.category === c)), [t.timeline]);
  const entries = t.timeline.filter((e) => active.size === 0 || active.has(e.category));
  const toggle = (c: TimelineCategory) => setActive((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <main className="mx-auto max-w-4xl space-y-3 px-3 pb-12 pt-3 sm:px-4" data-testid="timeline-page">
      {t.asOf && <HistoricalBanner asOf={t.asOf} />}
      <header className="panel space-y-2 p-4">
        <p className="eyebrow">Investigation timeline · {t.event.name}</p>
        <h1 className="text-lg font-semibold">{t.status?.title ?? t.event.name}</h1>
        {t.status && (
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="timeline-status">
            <span className="text-ink-faint">{t.asOf ? `Status as known on ${fmtUtc(t.asOf)}:` : "Current status:"}</span>
            <ClassificationBadge classification={t.status.classification} />
            <span className="text-ink-dim">Pathogen: {t.status.pathogenStatusLabel}</span>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Entries are ordered by when they occurred; when the date of occurrence was not reported they are placed at their publication time. Both dates are always shown. Corrections and denials stay in the record next to what they correct.
        </p>
        <AsOfControl asOf={t.asOf} />
      </header>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by category" data-testid="timeline-filters">
        {present.map((c) => (
          <button key={c} onClick={() => toggle(c)} aria-pressed={active.has(c)} data-testid={`timeline-filter-${c}`} className={cn("rounded-full border px-2.5 py-1 text-[11px]", active.has(c) ? "border-accent/50 bg-accent-dim text-accent" : "border-line-strong text-ink-dim hover:text-ink")}>
            {TIMELINE_CATEGORY_LABEL[c]} <span className="text-ink-faint">{t.timeline.filter((e) => e.category === c).length}</span>
          </button>
        ))}
        {active.size > 0 && <button className="px-2 text-[11px] text-ink-faint hover:text-ink" onClick={() => setActive(new Set())}>Clear</button>}
      </div>

      {t.notYetReported ? (
        <p className="panel p-6 text-sm text-ink-dim" data-testid="not-yet-reported">Not yet publicly reported at this time.</p>
      ) : (
        <ol className="relative space-y-2 border-l border-line pl-4" data-testid="timeline-list">
          {entries.map((e, i) => {
            const dayOf = (x: (typeof entries)[number]) => (x.occurredAt ?? x.publishedAt).slice(0, 10);
            const day = dayOf(e);
            const header = i === 0 || dayOf(entries[i - 1]!) !== day ? day : null;
            return (
              <li key={e.id} id={e.id} className="scroll-mt-20" data-testid="timeline-entry" data-category={e.category} data-verification={e.verificationStatus}>
                {header && <p className="-ml-4 mb-1 mt-3 pl-1 text-[11px] font-semibold text-ink-dim">{fmtUtc(header, false)}{e.occurredAt ? "" : " (by publication date)"}</p>}
                <div className={cn("panel space-y-1 p-3 text-xs", e.category === "CORRECTION" && "border-warn/30", e.category === "STATUS" && "border-accent/25")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryChip category={e.category} />
                    {e.sourceType && <SourceTypeBadge type={e.sourceType} />}
                    <VerificationBadge status={e.verificationStatus} />
                  </div>
                  <p className="text-[13px] font-medium" data-testid="timeline-entry-title">{e.title}</p>
                  <p className="leading-relaxed text-ink-dim">{e.body}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <EventDates e={e} />
                    <span className="text-[11px] text-ink-faint"><SourceLink source={e.source} attributedTo={e.attributedTo} /></span>
                    <Link href={`/timeline?asOf=${encodeURIComponent(new Date(Date.parse(e.publishedAt) + 1000).toISOString())}`} className="flex items-center gap-1 text-[11px] text-accent" data-testid="known-at-link"><History className="h-3 w-3" />What was known then</Link>
                  </div>
                </div>
              </li>
            );
          })}
          {entries.length === 0 && <li className="text-xs text-ink-faint">No entries in the selected categories.</li>}
        </ol>
      )}
    </main>
  );
}
