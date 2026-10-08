"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, PlayCircle, Plug } from "lucide-react";
import { useAction, Flash } from "./use-action";
import { fmtUtc, cn } from "@/lib/utils";
import { FAILURE_HINT, FAILURE_LABEL, type FailureKind } from "@/lib/ingestion/errors";
import { Ago } from "@/components/ui/time";

interface Run { status: string; startedAt: string; itemsNew: number; itemsDuplicate: number; errorMessage: string | null }
interface Source { id: string; slug: string; name: string; organization: string; kind: string; adapter: string; url: string | null; homepage: string | null; enabled: boolean; pollIntervalMinutes: number; lastFetchAt: string | null; lastSuccessAt: string | null; lastError: string | null; lastErrorKind: string | null; lastVerifiedAt: string | null; lastVerification: string | null; consecutiveFailures: number; endpointStatus: string; notes: string | null; runs: Run[]; _count: { articles: number } }
interface RunResult { sourceName: string; status: string; itemsNew: number; itemsDuplicate: number; itemsFetched: number; error: string | null; failureKind?: string | null }

function SourceRow({ s }: { s: Source }) {
  const { run, busy, error, message } = useAction();
  const [url, setUrl] = useState(s.url ?? "");
  const [interval, setInterval] = useState(String(s.pollIntervalMinutes));
  const manual = s.adapter === "MANUAL";
  const status = { WORKING: "text-ok", FAILING: "text-danger", BLOCKED: "text-warn", UNTESTED: "text-ink-faint" }[s.endpointStatus] ?? "text-ink-faint";
  return (
    <li className="space-y-2 px-4 py-3" data-testid={`source-${s.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{s.name} <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-faint">{s.kind} · {s.adapter}</span></p>
          <p className="text-[11px] text-ink-faint">
            {manual ? "Provenance-only source (not polled)" : <>{s.enabled ? <span className="text-ok">enabled</span> : "disabled"} · every {s.pollIntervalMinutes} min · endpoint <span className={status}>{s.endpointStatus.toLowerCase()}</span></>}
            {" · "}{s._count.articles} articles · last fetch {s.lastFetchAt ? <Ago iso={s.lastFetchAt} /> : "never"} · last success <Ago iso={s.lastSuccessAt} />
          </p>
          {s.lastError && (
            <p className="text-[11px] text-danger" data-testid="source-last-error">
              {s.lastErrorKind && <span className="mr-1 rounded border border-danger/40 px-1 text-[10px] font-semibold uppercase">{FAILURE_LABEL[s.lastErrorKind as FailureKind] ?? s.lastErrorKind}</span>}
              {s.lastError}
              {s.lastErrorKind && <span className="block text-ink-faint">{FAILURE_HINT[s.lastErrorKind as FailureKind]}</span>}
            </p>
          )}
          {s.lastVerifiedAt && <p className="text-[11px] text-ink-faint" data-testid="source-last-verification">Last endpoint check {fmtUtc(s.lastVerifiedAt)}: {s.lastVerification}</p>}
          {s.notes && <p className="text-[11px] text-ink-dim">{s.notes}</p>}
        </div>
        {!manual && (
          <div className="flex flex-wrap gap-1.5">
            <button className="btn" disabled={!!busy || !s.url} data-testid={`test-${s.slug}`} onClick={() => run<{ ok: boolean; items?: number; error?: string; label?: string }>("test", `/api/admin/sources/${s.id}/test`, "POST", undefined, (d) => (d.ok ? `Endpoint OK — ${d.items} items parsed (nothing stored).` : `Endpoint check failed — ${d.label}: ${d.error}`))}><Plug className="h-3 w-3" />{busy === "test" ? "Testing…" : "Test endpoint"}</button>
            <button className="btn btn-accent" disabled={!!busy || !s.url} data-testid={`fetch-${s.slug}`} onClick={() => run<{ result: RunResult }>("fetch", `/api/admin/sources/${s.id}/fetch`, "POST", undefined, ({ result: r }) => `${r.status}: ${r.itemsFetched} fetched, ${r.itemsNew} new, ${r.itemsDuplicate} duplicates${r.error ? ` — ${r.error}` : ""}`)}><Download className="h-3 w-3" />{busy === "fetch" ? "Fetching…" : "Fetch now"}</button>
            <button className="btn" disabled={!!busy} data-testid={`toggle-${s.slug}`} title={!s.enabled && s.endpointStatus !== "WORKING" ? "Requires a successful endpoint test first" : undefined} onClick={() => run("toggle", `/api/admin/sources/${s.id}`, "PATCH", { enabled: !s.enabled })}>{s.enabled ? "Disable" : "Enable"}</button>
          </div>
        )}
      </div>
      {!manual && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run("save", `/api/admin/sources/${s.id}`, "PATCH", { url: url.trim() || null, pollIntervalMinutes: Number(interval) }, () => "Saved."); }}>
          <input className="field min-w-0 flex-1 font-mono text-[11px]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Feed / API URL" aria-label={`${s.name} URL`} />
          <input className="field w-20" type="number" min={5} max={1440} value={interval} onChange={(e) => setInterval(e.target.value)} aria-label="Interval minutes" />
          <button className="btn" disabled={!!busy}>Save</button>
        </form>
      )}
      <Flash error={error} message={message} />
    </li>
  );
}

interface Live { state: string; detail: string; lastLiveSuccessAt: string | null; failing: { slug: string; name: string; label: string; error: string | null }[]; worker: { healthy: boolean; mode: string | null; lastTickAt: string | null; lastTickStatus: string | null } | null }

function HealthPanel({ live }: { live: Live }) {
  const tone = live.state === "LIVE" ? "border-ok/30 bg-ok/[0.05]" : live.state === "DOWN" ? "border-danger/30 bg-danger/[0.05]" : "border-warn/30 bg-warn/[0.05]";
  return (
    <section className={cn("rounded-lg border px-4 py-3 text-xs", tone)} data-testid="source-health">
      <p className="text-[13px] font-medium">Live ingestion: {live.state === "LIVE" ? "live" : live.state === "DOWN" ? "down — all enabled sources failing" : live.state === "NOT_CONFIGURED" ? "no automatic sources enabled" : "stale"}</p>
      <p className="text-ink-dim">{live.detail} Last successful live ingestion: {live.lastLiveSuccessAt ? fmtUtc(live.lastLiveSuccessAt) : "never"}.</p>
      {live.worker && (
        <p className="text-ink-dim" data-testid="worker-health">
          Ingestion process: <span className={live.worker.healthy ? "text-ok" : "text-warn"}>{live.worker.healthy ? "running" : "not running"}</span>
          {live.worker.lastTickAt ? <> · {live.worker.mode} · last pass {fmtUtc(live.worker.lastTickAt)} — {live.worker.lastTickStatus}</> : " · no scheduler, worker or cron pass recorded"}
        </p>
      )}
      {live.failing.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {live.failing.map((f) => <li key={f.slug}><span className="font-medium">{f.name}</span>: <span className="text-danger">{f.label}</span>{f.error ? <span className="text-ink-faint"> — {f.error}</span> : null}</li>)}
        </ul>
      )}
      <p className="mt-1.5 text-ink-faint">Run <code className="font-mono">npm run verify:sources</code> on a machine with normal internet access to check every endpoint (schema, freshness, ordering, paging).</p>
    </section>
  );
}

export function SourcesAdmin({ sources, pending, scheduler, live }: { sources: Source[]; pending: number; scheduler: { running: boolean; startedAt: string | null; lastTickAt: string | null }; live: Live }) {
  const { run, busy, error, message } = useAction();
  const [results, setResults] = useState<RunResult[] | null>(null);
  const auto = sources.filter((s) => s.adapter !== "MANUAL");
  const manual = sources.filter((s) => s.adapter === "MANUAL");
  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Sources & ingestion</h1>
          <p className="text-xs text-ink-dim">Scheduler: <span className={cn(scheduler.running ? "text-ok" : "text-warn")}>{scheduler.running ? <>running since {fmtUtc(scheduler.startedAt)}{scheduler.lastTickAt ? <>, last tick <Ago iso={scheduler.lastTickAt} /></> : null}</> : "not running in this process"}</span> · <Link href="/admin/review" className="text-accent">{pending} articles awaiting review</Link></p>
        </div>
        <button className="btn btn-accent" disabled={!!busy} data-testid="fetch-all" onClick={async () => { const d = await run<{ results: RunResult[] }>("all", "/api/admin/ingest", "POST", undefined, (d) => `Fetched ${d.results.length} sources.`); if (d) setResults(d.results); }}>
          <PlayCircle className="h-3.5 w-3.5" />{busy === "all" ? "Fetching all sources…" : "Fetch Now (all enabled)"}
        </button>
      </div>
      <HealthPanel live={live} />
      <Flash error={error} message={message} />
      {results && (
        <ul className="panel divide-y divide-line text-xs" data-testid="fetch-results">
          {results.length === 0 && <li className="px-4 py-2 text-ink-faint">No enabled automatic sources.</li>}
          {results.map((r) => <li key={r.sourceName} className="px-4 py-2"><span className="font-medium">{r.sourceName}</span>: <span className={r.status === "FAILED" ? "text-danger" : "text-ok"}>{r.status}</span>{r.failureKind ? <span className="text-danger"> ({FAILURE_LABEL[r.failureKind as FailureKind] ?? r.failureKind})</span> : null} · {r.itemsFetched} fetched · {r.itemsNew} new · {r.itemsDuplicate} duplicate{r.error ? <span className="text-danger"> · {r.error}</span> : null}</li>)}
        </ul>
      )}
      <section className="panel"><div className="panel-head"><h2 className="eyebrow">Automatic sources</h2></div><ul className="divide-y divide-line">{auto.map((s) => <SourceRow key={s.id} s={s} />)}</ul></section>
      <section className="panel"><div className="panel-head"><h2 className="eyebrow">Provenance sources (manual / seeded)</h2></div><ul className="divide-y divide-line">{manual.map((s) => <SourceRow key={s.id} s={s} />)}</ul></section>
    </main>
  );
}
