// What the public UI may claim about freshness. "Live" is only claimed when a real (non-fixture) automatic
// source succeeded recently enough to prove that scheduled ingestion is actually happening.
import { FAILURE_LABEL, isLiveUrl, type FailureKind } from "@/lib/ingestion/errors";

export type LiveState = "LIVE" | "STALE" | "DOWN" | "NOT_CONFIGURED";

export interface SourceHealth {
  slug: string;
  name: string;
  url: string | null;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastSuccessAt: Date | null;
  lastFetchAt: Date | null;
  endpointStatus: string;
  lastErrorKind: string | null;
  lastError: string | null;
}

export interface HeartbeatInfo {
  mode: string;
  lastTickAt: Date;
  lastTickStatus: string | null;
}

export interface LiveStatus {
  state: LiveState;
  label: string;
  detail: string;
  /** Most recent success of a real (non-fixture) automatic source, any time. */
  lastLiveSuccessAt: string | null;
  lastLiveAttemptAt: string | null;
  failing: { slug: string; name: string; kind: string | null; label: string; error: string | null }[];
  /** Ingestion process liveness (scheduler, worker or cron). null when not tracked by the caller. */
  worker: { healthy: boolean; mode: string | null; lastTickAt: string | null; lastTickStatus: string | null } | null;
}

/** `heartbeat`: latest ingestion-process heartbeat (null = none ever), or undefined when the caller does not track it.
 * LIVE requires a recent real success AND (when tracked) a recent heartbeat, so a stopped worker can never keep
 * the indicator green on the strength of an old success. */
export function computeLiveStatus(sources: readonly SourceHealth[], now = new Date(), heartbeat?: HeartbeatInfo | null): LiveStatus {
  const live = sources.filter((s) => isLiveUrl(s.url));
  const enabled = live.filter((s) => s.enabled);
  const maxDate = (ds: (Date | null)[]) => ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
  const lastLiveSuccess = maxDate(live.map((s) => s.lastSuccessAt));
  const lastLiveAttempt = maxDate(live.map((s) => s.lastFetchAt));
  // A source is failing when its last attempt is newer than its last success.
  const failing = enabled
    .filter((s) => s.lastFetchAt && (!s.lastSuccessAt || s.lastFetchAt > s.lastSuccessAt))
    .map((s) => ({ slug: s.slug, name: s.name, kind: s.lastErrorKind, label: s.lastErrorKind ? (FAILURE_LABEL[s.lastErrorKind as FailureKind] ?? s.lastErrorKind) : "Failed", error: s.lastError }));
  const minInterval = enabled.length ? Math.min(...enabled.map((s) => s.pollIntervalMinutes)) : 15;
  const heartbeatWindow = Math.max(5, 2 * minInterval) * 60_000;
  const worker =
    heartbeat === undefined
      ? null
      : { healthy: Boolean(heartbeat && now.getTime() - heartbeat.lastTickAt.getTime() <= heartbeatWindow), mode: heartbeat?.mode ?? null, lastTickAt: heartbeat?.lastTickAt.toISOString() ?? null, lastTickStatus: heartbeat?.lastTickStatus ?? null };
  const base = { lastLiveSuccessAt: lastLiveSuccess?.toISOString() ?? null, lastLiveAttemptAt: lastLiveAttempt?.toISOString() ?? null, failing, worker };

  if (enabled.length === 0) return { ...base, state: "NOT_CONFIGURED", label: "Not live", detail: "No automatic sources are enabled. Data shown is seeded or previously retrieved." };
  const window = minInterval * 2 * 60_000;
  const recent = enabled.some((s) => s.lastSuccessAt && now.getTime() - s.lastSuccessAt.getTime() <= window);
  if (worker && !worker.healthy) {
    return { ...base, state: "STALE", label: "Not live", detail: worker.lastTickAt ? `The ingestion process (${worker.mode}) has not run since ${worker.lastTickAt}. Start \`npm run worker\` or the cron job.` : "No ingestion process (scheduler, worker or cron) has run yet." };
  }
  if (recent) {
    return { ...base, state: "LIVE", label: "Live", detail: failing.length ? `Live; ${failing.length} of ${enabled.length} sources failing` : `All ${enabled.length} enabled sources succeeding` };
  }
  if (failing.length === enabled.length) {
    const kinds = [...new Set(failing.map((f) => f.label))].join("; ");
    return { ...base, state: "DOWN", label: "Not live", detail: `All enabled automatic sources are failing (${kinds}). Data shown is seeded or previously retrieved.` };
  }
  return { ...base, state: "STALE", label: "Stale", detail: lastLiveSuccess ? "No recent successful ingestion; data may be out of date." : "No automatic source has succeeded yet." };
}
