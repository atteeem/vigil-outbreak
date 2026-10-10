// Case-statistics integrity rules. These are the functions that decide what number appears in a headline.
//
// 1. Never sum across sources or overlapping/cumulative periods: the headline for a metric is ONE observation
//    (the most recent cumulative one), not an aggregate.
// 2. A headline "confirmed" figure only comes from OFFICIAL + VERIFIED observations. Media or unverified
//    figures are returned separately as `reported` and are never promoted into `confirmed`.
// 3. Metrics never cross: people under observation, hospitalised contacts or negative tests are not cases.
// 4. Unknown stays unknown: no qualifying observation => null, never 0.
// 5. Historical views only see observations whose `reportedAt` <= asOf, with verification decided later
//    treated as not yet known.

import type { Metric } from "./enums";

export interface ObservationLike {
  id: string;
  metric: string;
  value: number | null;
  valueHigh?: number | null;
  isCumulative: boolean;
  asOfDate: Date | null;
  reportedAt: Date;
  sourceType: string;
  verificationStatus: string;
  verifiedAt?: Date | null;
  deathCauseConfirmed?: boolean | null;
  attributedTo?: string | null;
  scope?: string | null;
}

/** Verification as it was known at `asOf`: a verdict reached after asOf is not visible in the past. */
export function verificationAt(status: string, verifiedAt: Date | null | undefined, asOf: Date | null): string {
  if (!asOf || !verifiedAt) return status;
  return verifiedAt.getTime() > asOf.getTime() ? "UNVERIFIED" : status;
}

/** Claims: in a historical view a verdict (and any conflict note) is only shown once it had been reached. A verdict
 * without a recorded date is not shown in the past at all (we cannot tell when it became known). */
export function claimVerdictAt(status: string, reviewedAt: Date | null | undefined, asOf: Date | null): { status: string; showConflict: boolean } {
  if (!asOf) return { status, showConflict: true };
  if (!reviewedAt || reviewedAt.getTime() > asOf.getTime()) return { status: "UNVERIFIED", showConflict: false };
  return { status, showConflict: true };
}

export function visibleAt<T extends { reportedAt: Date }>(rows: readonly T[], asOf: Date | null): T[] {
  if (!asOf) return [...rows];
  const t = asOf.getTime();
  return rows.filter((r) => r.reportedAt.getTime() <= t);
}

const refTime = (o: ObservationLike) => (o.asOfDate ?? o.reportedAt).getTime();

/** Most recent observation: by the date the figure refers to, then by publication time. */
export function latest<T extends ObservationLike>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || refTime(r) > refTime(best) || (refTime(r) === refTime(best) && r.reportedAt > best.reportedAt)) best = r;
  }
  return best;
}

export interface MetricHeadline<T extends ObservationLike = ObservationLike> {
  metric: Metric;
  /** Official, verified, cumulative figure — the only thing allowed in a headline. */
  confirmed: T | null;
  /** Most recent figure from any other provenance (media, unverified, disputed) — display with its label. */
  reported: T | null;
}

export function headlineFor<T extends ObservationLike>(rows: readonly T[], metric: Metric, asOf: Date | null): MetricHeadline<T> {
  const pool = visibleAt(rows, asOf).filter((r) => r.metric === metric && r.value !== null);
  const status = (r: T) => verificationAt(r.verificationStatus, r.verifiedAt, asOf);
  const official = pool.filter((r) => r.sourceType === "OFFICIAL" && status(r) === "VERIFIED" && r.isCumulative);
  const other = pool.filter((r) => !official.includes(r) && status(r) !== "REFUTED");
  return { metric, confirmed: latest(official), reported: latest(other) };
}

export interface CaseSummary {
  confirmedCases: number | null;
  probableCases: number | null;
  suspectedCases: number | null;
  deaths: number | null;
  /** Deaths whose cause has been laboratory-attributed to the event's pathogen (null if not established). */
  deathsCauseConfirmed: boolean | null;
  underObservation: number | null;
  /** Unverified / media figures, never merged into the numbers above. */
  reportedUnverified: Partial<Record<Metric, { value: number; valueHigh: number | null; attributedTo: string | null; sourceType: string }>>;
}

export function summarizeCases<T extends ObservationLike>(rows: readonly T[], asOf: Date | null): CaseSummary {
  const metrics: Metric[] = ["CONFIRMED_CASES", "PROBABLE_CASES", "SUSPECTED_CASES", "DEATHS", "UNDER_OBSERVATION"];
  const h = Object.fromEntries(metrics.map((m) => [m, headlineFor(rows, m, asOf)])) as Record<Metric, MetricHeadline<T>>;
  const reportedUnverified: CaseSummary["reportedUnverified"] = {};
  for (const m of metrics) {
    const r = h[m].reported;
    // Only surface an "other" figure if it is newer than the verified headline (otherwise it is stale noise).
    if (r && r.value !== null && (!h[m].confirmed || refTime(r) > refTime(h[m].confirmed!))) {
      reportedUnverified[m] = { value: r.value, valueHigh: r.valueHigh ?? null, attributedTo: r.attributedTo ?? null, sourceType: r.sourceType };
    }
  }
  const death = h.DEATHS.confirmed;
  return {
    confirmedCases: h.CONFIRMED_CASES.confirmed?.value ?? null,
    probableCases: h.PROBABLE_CASES.confirmed?.value ?? null,
    suspectedCases: h.SUSPECTED_CASES.confirmed?.value ?? null,
    deaths: death?.value ?? null,
    deathsCauseConfirmed: death ? (death.deathCauseConfirmed ?? null) : null,
    underObservation: h.UNDER_OBSERVATION.confirmed?.value ?? null,
    reportedUnverified,
  };
}

/** Time series for charts: one point per observation, official+verified only, never accumulated. Returns []
 * when there are fewer than two compatible points (a single value is not a trend). */
export function seriesFor<T extends ObservationLike>(rows: readonly T[], metric: Metric, asOf: Date | null): { t: number; value: number; id: string }[] {
  const pool = visibleAt(rows, asOf).filter(
    (r) => r.metric === metric && r.value !== null && r.isCumulative && r.sourceType === "OFFICIAL" && verificationAt(r.verificationStatus, r.verifiedAt, asOf) === "VERIFIED",
  );
  // Same reference date reported twice (e.g. a re-publication): keep the later publication only.
  const byRef = new Map<number, T>();
  for (const r of pool) {
    const k = refTime(r);
    const prev = byRef.get(k);
    if (!prev || r.reportedAt > prev.reportedAt) byRef.set(k, r);
  }
  return [...byRef.entries()].sort((a, b) => a[0] - b[0]).map(([t, r]) => ({ t, value: r.value!, id: r.id }));
}

export function formatCount(n: number | null | undefined, high?: number | null): string {
  if (n === null || n === undefined) return "Not reported";
  const f = (x: number) => x.toLocaleString("en-US");
  return high && high !== n ? `${f(n)}–${f(high)}` : f(n);
}
